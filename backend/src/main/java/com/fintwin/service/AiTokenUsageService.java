package com.fintwin.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fintwin.ai.AiQuotaExceededException;
import com.fintwin.model.User;
import com.fintwin.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Date;
import java.time.LocalDate;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Model tokens per user, per AI feature, per day.
 *
 * The AI service can't know whose request it is serving, so it returns each
 * request's token counts in the {@value #USAGE_HEADER} response header
 * ({@code {"coach":{"in":812,"out":143,"calls":1}}}). The ai-service
 * RestTemplates hand that header to {@link #record}, which attributes it to
 * the logged-in user and adds it to today's row in {@code ai_token_usage}.
 * Every AI call runs on the user's request thread, so the security context is
 * the source of truth; a call with no user (none today) is simply not counted.
 */
@Service
public class AiTokenUsageService {

    public static final String USAGE_HEADER = "X-LLM-Usage";

    private static final Logger log = LoggerFactory.getLogger(AiTokenUsageService.class);
    private static final Pattern FEATURE = Pattern.compile("[a-z_]{1,32}");
    private static final TypeReference<Map<String, Map<String, Number>>> HEADER_TYPE = new TypeReference<>() {};

    private static final String UPSERT = """
            INSERT INTO ai_token_usage (user_id, usage_date, feature, input_tokens, output_tokens, calls)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (user_id, usage_date, feature) DO UPDATE SET
                input_tokens  = ai_token_usage.input_tokens  + EXCLUDED.input_tokens,
                output_tokens = ai_token_usage.output_tokens + EXCLUDED.output_tokens,
                calls         = ai_token_usage.calls         + EXCLUDED.calls
            """;

    private final JdbcTemplate jdbc;
    private final UserRepository users;
    private final ObjectMapper mapper;
    private final TransactionTemplate ownTx;
    private final long dailyTokenLimit;

    public AiTokenUsageService(JdbcTemplate jdbc, UserRepository users, ObjectMapper mapper,
                               PlatformTransactionManager txManager,
                               @Value("${ai.daily-token-limit:200000}") long dailyTokenLimit) {
        this.jdbc = jdbc;
        this.users = users;
        this.mapper = mapper;
        this.dailyTokenLimit = dailyTokenLimit;
        // Its own read-write transaction: the AI call may sit inside a
        // read-only one (a GET), and a failed write here must not roll back
        // the caller's work.
        this.ownTx = new TransactionTemplate(txManager);
        this.ownTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    // ── Recording ────────────────────────────────────────────────────────────

    /** Adds one AI-service response's usage header to the current user's totals. Never throws. */
    public void record(String headerValue) {
        try {
            Map<String, Map<String, Number>> usage = mapper.readValue(headerValue, HEADER_TYPE);
            if (usage.isEmpty()) return;
            Optional<Long> userId = currentUserId();
            if (userId.isEmpty()) return;
            Date today = Date.valueOf(LocalDate.now());
            ownTx.executeWithoutResult(status -> usage.forEach((feature, n) -> {
                if (!FEATURE.matcher(feature).matches() || n == null) return;
                long in = count(n.get("in")), out = count(n.get("out")), calls = count(n.get("calls"));
                if (in == 0 && out == 0 && calls == 0) return;
                jdbc.update(UPSERT, userId.get(), today, feature, in, out, calls);
            }));
        } catch (Exception e) {
            // Counting must never fail the user's AI request
            log.warn("Could not record AI token usage: {}", e.getClass().getSimpleName());
        }
    }

    private Optional<Long> currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken) {
            return Optional.empty();
        }
        return users.findByEmail(auth.getName()).map(User::getId);
    }

    // ── Daily allowance ──────────────────────────────────────────────────────

    /**
     * Throws {@link AiQuotaExceededException} when the logged-in user has
     * used today's allowance. Called before every model-backed AI call.
     * No user (none today), a limit of 0 (off) and admins are never capped.
     */
    public void checkAllowance() {
        if (dailyTokenLimit <= 0) return;
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getAuthorities().stream().anyMatch(a ->
                "ROLE_ADMIN".equals(a.getAuthority()) || "ROLE_SUPER_ADMIN".equals(a.getAuthority()))) {
            return;
        }
        Optional<Long> userId = currentUserId();
        if (userId.isEmpty()) return;
        long used = usedToday(userId.get());
        if (used >= dailyTokenLimit) {
            throw new AiQuotaExceededException(used, dailyTokenLimit);
        }
    }

    public long usedToday(Long userId) {
        Long used = jdbc.queryForObject("""
                SELECT COALESCE(SUM(input_tokens + output_tokens), 0)
                FROM ai_token_usage WHERE user_id = ? AND usage_date = ?
                """, Long.class, userId, Date.valueOf(LocalDate.now()));
        return used == null ? 0 : used;
    }

    public long dailyTokenLimit() {
        return dailyTokenLimit;
    }

    private static long count(Number n) {
        return n == null ? 0 : Math.max(0, n.longValue());
    }

    // ── Admin view ───────────────────────────────────────────────────────────

    public record FeatureUsage(String feature, long inputTokens, long outputTokens, long totalTokens,
                               long calls, long users) {}

    public record UserFeatureUsage(long inputTokens, long outputTokens, long totalTokens, long calls) {}

    public record UserUsage(long userId, String email, String fullName, long inputTokens, long outputTokens,
                            long totalTokens, long calls, LocalDate lastUsed,
                            Map<String, UserFeatureUsage> byFeature) {}

    public record DailyUsage(LocalDate date, long inputTokens, long outputTokens, long calls) {}

    public record Totals(long inputTokens, long outputTokens, long totalTokens, long calls, long activeUsers) {}

    public record Summary(int days, LocalDate from, LocalDate to, Totals totals, List<FeatureUsage> byFeature,
                          List<DailyUsage> daily, List<UserUsage> users, long userCount) {}

    /**
     * Usage over the last {@code days} days (today included): totals, per
     * feature, per day, and per user with each user's per-feature split,
     * heaviest users first, at most {@code limit} of them.
     */
    public Summary summary(int days, int limit) {
        LocalDate to = LocalDate.now();
        LocalDate from = to.minusDays(days - 1L);
        Date fromDate = Date.valueOf(from);

        // One row per user and feature: at most users × 8 rows
        record Row(long userId, String feature, long in, long out, long calls, LocalDate lastUsed) {}
        List<Row> rows = jdbc.query("""
                SELECT user_id, feature, SUM(input_tokens), SUM(output_tokens), SUM(calls), MAX(usage_date)
                FROM ai_token_usage WHERE usage_date >= ?
                GROUP BY user_id, feature
                """,
                (rs, i) -> new Row(rs.getLong(1), rs.getString(2), rs.getLong(3), rs.getLong(4), rs.getLong(5),
                        rs.getDate(6).toLocalDate()),
                fromDate);

        Map<String, long[]> featureTotals = new TreeMap<>();          // in, out, calls, users
        Map<Long, List<Row>> rowsByUser = new LinkedHashMap<>();
        for (Row r : rows) {
            long[] f = featureTotals.computeIfAbsent(r.feature(), k -> new long[4]);
            f[0] += r.in(); f[1] += r.out(); f[2] += r.calls(); f[3]++;
            rowsByUser.computeIfAbsent(r.userId(), k -> new ArrayList<>()).add(r);
        }

        List<FeatureUsage> byFeature = featureTotals.entrySet().stream()
                .map(e -> new FeatureUsage(e.getKey(), e.getValue()[0], e.getValue()[1],
                        e.getValue()[0] + e.getValue()[1], e.getValue()[2], e.getValue()[3]))
                .sorted(Comparator.comparingLong(FeatureUsage::totalTokens).reversed())
                .toList();

        long in = 0, out = 0, calls = 0;
        for (FeatureUsage f : byFeature) { in += f.inputTokens(); out += f.outputTokens(); calls += f.calls(); }
        Totals totals = new Totals(in, out, in + out, calls, rowsByUser.size());

        // Heaviest users first; names and emails are encrypted at rest, so
        // they come through the entity rather than the SQL above.
        List<Map.Entry<Long, List<Row>>> ranked = rowsByUser.entrySet().stream()
                .sorted(Comparator.comparingLong((Map.Entry<Long, List<Row>> e) ->
                        e.getValue().stream().mapToLong(r -> r.in() + r.out()).sum()).reversed())
                .limit(limit)
                .toList();
        Map<Long, User> userById = new HashMap<>();
        users.findAllById(ranked.stream().map(Map.Entry::getKey).toList())
                .forEach(u -> userById.put(u.getId(), u));

        List<UserUsage> perUser = ranked.stream().map(e -> {
            Map<String, UserFeatureUsage> split = new TreeMap<>();
            long uIn = 0, uOut = 0, uCalls = 0;
            LocalDate last = null;
            for (Row r : e.getValue()) {
                split.put(r.feature(), new UserFeatureUsage(r.in(), r.out(), r.in() + r.out(), r.calls()));
                uIn += r.in(); uOut += r.out(); uCalls += r.calls();
                if (last == null || r.lastUsed().isAfter(last)) last = r.lastUsed();
            }
            User u = userById.get(e.getKey());
            return new UserUsage(e.getKey(), u == null ? null : u.getEmail(), u == null ? null : u.getFullName(),
                    uIn, uOut, uIn + uOut, uCalls, last, split);
        }).toList();

        List<DailyUsage> daily = jdbc.query("""
                SELECT usage_date, SUM(input_tokens), SUM(output_tokens), SUM(calls)
                FROM ai_token_usage WHERE usage_date >= ?
                GROUP BY usage_date ORDER BY usage_date
                """,
                (rs, i) -> new DailyUsage(rs.getDate(1).toLocalDate(), rs.getLong(2), rs.getLong(3), rs.getLong(4)),
                fromDate);

        return new Summary(days, from, to, totals, byFeature, daily, perUser, rowsByUser.size());
    }
}
