package com.fintwin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fintwin.model.FinancialGoal;
import com.fintwin.model.GoalEarmark;
import com.fintwin.model.SpendGuardState;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.FinancialGoalRepository;
import com.fintwin.repository.GoalEarmarkRepository;
import com.fintwin.repository.SpendGuardStateRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.util.Categorized;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Where Spend Guard meets the rest of FinTwin. guard-service only proposes; the
 * backend checks every field here and writes for the signed-in user:
 * <ul>
 *   <li>a payment the user paid through Spend Guard becomes a transaction
 *       (source SPEND_GUARD, external id "GUARD:&lt;event&gt;"). It is provisional,
 *       like an alert-email transaction: the statement row for the same money
 *       takes it over on import, so it never counts twice.</li>
 *   <li>an approved salary plan earmarks goal money for the month
 *       ({@link GoalEarmark}).</li>
 *   <li>Spend Guard's own records are stored here, encrypted, instead of in the
 *       guard service's memory, with a small summary the Copilot can read.</li>
 *   <li>a scanned payee is categorised with FinTwin's categoriser and the user's
 *       own corrections.</li>
 * </ul>
 */
@Service
public class SpendGuardLinks {

    private static final Logger log = LoggerFactory.getLogger(SpendGuardLinks.class);

    public static final String SOURCE = "SPEND_GUARD";
    /** A statement covering its date came in without it: the user is asked whether they paid. */
    public static final String SOURCE_NOT_IN_STATEMENT = "SPEND_GUARD_UNMATCHED";
    /** The user said they paid anyway (from another account, say): never asked again. */
    public static final String SOURCE_KEPT = "SPEND_GUARD_KEPT";

    public static boolean isSpendGuard(String source) {
        return source != null && source.startsWith(SOURCE);
    }
    public static final String EXTERNAL_ID_PREFIX = "GUARD:";
    static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");

    static final BigDecimal MAX_PAYMENT = new BigDecimal("500000");
    static final long MAX_EARMARK = 10_000_000L;
    static final int MAX_STATE_CHARS = 1_500_000;
    static final int MAX_SUMMARY_CHARS = 4_000;

    /** Categories a Spend Guard payment may carry as they are. Anything else is re-categorised. */
    static final Set<String> CATEGORIES = Set.of(
            "Food", "Groceries", "Shopping", "Entertainment", "Transport", "Travel", "Bills",
            "Rent", "Health", "Education", "Investments", "People", "Local Shops", "EMI", "Other");
    static final Set<String> CATEGORY_SOURCES = Set.of(
            Categorized.LEARNED, Categorized.BRAND, Categorized.SHOP_WORD, Categorized.PERSON,
            Categorized.MERCHANT_REF, Categorized.PAYMENT_PATTERN, Categorized.MERCHANT_CODE,
            Categorized.NONE);

    private static final Pattern EVENT_ID = Pattern.compile("[a-f0-9]{1,64}");
    private static final Pattern MONTH = Pattern.compile("\\d{4}-\\d{2}");

    private final UserRepository users;
    private final TransactionRepository transactions;
    private final FinancialGoalRepository goals;
    private final GoalEarmarkRepository earmarks;
    private final SpendGuardStateRepository states;
    private final CategoryService categories;
    private final ObjectMapper mapper = new ObjectMapper();

    public SpendGuardLinks(UserRepository users, TransactionRepository transactions,
                           FinancialGoalRepository goals, GoalEarmarkRepository earmarks,
                           SpendGuardStateRepository states, CategoryService categories) {
        this.users = users;
        this.transactions = transactions;
        this.goals = goals;
        this.earmarks = earmarks;
        this.states = states;
        this.categories = categories;
    }

    // ── 1. Payments become transactions ──────────────────────────────────────

    /**
     * Records a payment the user paid through Spend Guard. Returns the
     * transaction's id, or null when the record isn't valid. Recording the same
     * event twice returns the first transaction.
     */
    @Caching(evict = {
        @CacheEvict(value = "user-insights",
                    key = "T(com.fintwin.security.SecurityUtils).getCurrentUserEmail()"),
        @CacheEvict(value = "user-score",
                    key = "T(com.fintwin.security.SecurityUtils).getCurrentUserEmail()")
    })
    @Transactional
    public Long recordPayment(Long userId, Map<?, ?> record) {
        String eventId = text(record.get("eventId"), 64);
        BigDecimal amount = money(record.get("amount"));
        if (eventId == null || !EVENT_ID.matcher(eventId).matches()
                || amount == null || amount.compareTo(MAX_PAYMENT) > 0) {
            log.warn("Spend Guard payment record rejected: bad event id or amount");
            return null;
        }
        User user = users.findById(userId).orElse(null);
        if (user == null) return null;

        String externalId = EXTERNAL_ID_PREFIX + eventId;
        Optional<Transaction> existing = transactions.findByUserAndExternalId(user, externalId);
        if (existing.isPresent()) return existing.get().getId();

        String merchant = text(record.get("merchant"), 120);
        if (merchant == null) merchant = "UPI payment";

        Transaction t = new Transaction();
        t.setDate(LocalDate.now(INDIA));
        t.setMerchant(merchant);
        t.setAmountExact(amount.negate());           // money out
        t.applyPrediction(category(user, merchant,
                text(record.get("category"), 40), text(record.get("categorySource"), 20)));
        t.setSource(SOURCE);
        t.setExternalId(externalId);
        t.setUser(user);
        return transactions.save(t).getId();
    }

    /**
     * "I didn't pay": removes the transaction Spend Guard recorded for an event,
     * as long as it is still Spend Guard's (a statement hasn't taken it over).
     */
    @Caching(evict = {
        @CacheEvict(value = "user-insights",
                    key = "T(com.fintwin.security.SecurityUtils).getCurrentUserEmail()"),
        @CacheEvict(value = "user-score",
                    key = "T(com.fintwin.security.SecurityUtils).getCurrentUserEmail()")
    })
    @Transactional
    public boolean unrecordPayment(Long userId, String eventId) {
        if (eventId == null || !EVENT_ID.matcher(eventId).matches()) return false;
        User user = users.findById(userId).orElse(null);
        if (user == null) return false;
        Optional<Transaction> t = transactions.findByUserAndExternalId(user, EXTERNAL_ID_PREFIX + eventId);
        if (t.isEmpty() || !isSpendGuard(t.get().getSource())) return false;
        transactions.delete(t.get());
        return true;
    }

    /** Is the transaction recorded for this event still Spend Guard's own (not taken over by a statement)? */
    @Transactional(readOnly = true)
    public boolean stillProvisional(Long userId, String eventId) {
        if (eventId == null || !EVENT_ID.matcher(eventId).matches()) return false;
        return users.findById(userId)
                .flatMap(u -> transactions.findByUserAndExternalId(u, EXTERNAL_ID_PREFIX + eventId))
                .map(t -> isSpendGuard(t.getSource()))
                .orElse(false);
    }

    /** "I did pay": a payment the statement didn't show stays, and stops asking. */
    @Transactional
    public void keepPayment(Long userId, String eventId) {
        if (eventId == null || !EVENT_ID.matcher(eventId).matches()) return;
        users.findById(userId)
                .flatMap(u -> transactions.findByUserAndExternalId(u, EXTERNAL_ID_PREFIX + eventId))
                .filter(t -> SOURCE_NOT_IN_STATEMENT.equals(t.getSource()))
                .ifPresent(t -> { t.setSource(SOURCE_KEPT); transactions.save(t); });
    }

    /** Event ids of the Spend Guard payments a statement didn't show, waiting for the user's answer. */
    @Transactional(readOnly = true)
    public java.util.Set<String> notInStatement(Long userId) {
        User user = users.findById(userId).orElse(null);
        if (user == null) return java.util.Set.of();
        java.util.Set<String> out = new java.util.HashSet<>();
        for (Transaction t : transactions.findByUserAndSource(user, SOURCE_NOT_IN_STATEMENT)) {
            String ext = t.getExternalId();
            if (ext != null && ext.startsWith(EXTERNAL_ID_PREFIX)) out.add(ext.substring(EXTERNAL_ID_PREFIX.length()));
        }
        return out;
    }

    private Categorized category(User user, String merchant, String category, String source) {
        if (category != null && CATEGORIES.contains(category)) {
            return new Categorized(category, source != null && CATEGORY_SOURCES.contains(source)
                    ? source : Categorized.NONE);
        }
        return categories.classify(merchant, categories.learnedRulesFor(user));
    }

    // ── 2. FinTwin's categoriser for a scanned payee ────────────────────────

    /** FinTwin's category for a payee name, with the user's own corrections first. */
    @Transactional(readOnly = true)
    public Categorized categorize(Long userId, String name) {
        String clean = text(name, 120);
        if (clean == null) return Categorized.other();
        User user = users.findById(userId).orElse(null);
        if (user == null) return Categorized.other();
        return categories.classify(clean, categories.learnedRulesFor(user));
    }

    // ── 3. Spend Guard's records, kept in FinTwin ───────────────────────────

    @Transactional(readOnly = true)
    public Optional<String> loadState(Long userId) {
        return states.findById(userId).map(SpendGuardState::getState);
    }

    /** Stores the guard's document. False when it isn't a JSON object or is too big. */
    @Transactional
    public boolean saveState(Long userId, String state, String summary) {
        if (!jsonObject(state, MAX_STATE_CHARS)) return false;
        if (summary != null && !jsonObject(summary, MAX_SUMMARY_CHARS)) summary = null;
        if (!users.existsById(userId)) return false;
        SpendGuardState row = states.findById(userId).orElseGet(SpendGuardState::new);
        row.setUserId(userId);
        row.setState(state);
        row.setSummary(summary);
        row.setUpdatedAt(LocalDateTime.now());
        states.save(row);
        return true;
    }

    /** This month's Spend Guard figures for the Copilot, or "not used yet". */
    @Transactional(readOnly = true)
    public Map<String, Object> summary(Long userId) {
        Optional<SpendGuardState> row = states.findById(userId);
        if (row.isEmpty() || row.get().getSummary() == null) {
            return Map.of("active", false, "message", "This user hasn't used Spend Guard yet.");
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> s = new LinkedHashMap<>(mapper.readValue(row.get().getSummary(), Map.class));
            s.put("active", true);
            s.put("updatedAt", row.get().getUpdatedAt().toString());
            return s;
        } catch (Exception e) {
            return Map.of("active", false, "message", "Spend Guard's figures couldn't be read.");
        }
    }

    // ── 4. An approved salary plan earmarks goal money ──────────────────────

    /**
     * Earmarks each goal's share of an approved plan for its month. Goals are
     * matched by title among the user's open goals; unknown titles are skipped.
     * Approving again for the same month replaces the earlier amounts.
     * Returns how many goals were earmarked.
     */
    @Transactional
    public int earmarkGoals(Long userId, Map<?, ?> goalPlan) {
        String month = text(goalPlan.get("month"), 7);
        if (month == null || !MONTH.matcher(month).matches()) return 0;
        YearMonth ym;
        try {
            ym = YearMonth.parse(month);
        } catch (Exception e) {
            return 0;
        }
        YearMonth now = YearMonth.now(INDIA);
        if (ym.isBefore(now.minusMonths(1)) || ym.isAfter(now.plusMonths(1))) return 0;
        if (!(goalPlan.get("goals") instanceof List<?> shares) || shares.size() > 20) return 0;

        User user = users.findById(userId).orElse(null);
        if (user == null) return 0;
        Map<String, FinancialGoal> byTitle = new HashMap<>();
        for (FinancialGoal g : goals.findByUser(user)) {
            if (Boolean.TRUE.equals(g.getCompleted()) || g.getTitle() == null) continue;
            byTitle.putIfAbsent(g.getTitle().trim().toLowerCase(Locale.ROOT), g);
        }

        int count = 0;
        for (Object o : shares) {
            if (!(o instanceof Map<?, ?> share)) continue;
            String title = text(share.get("goal"), 120);
            BigDecimal amount = money(share.get("amount"));
            if (title == null || amount == null || amount.longValue() > MAX_EARMARK) continue;
            FinancialGoal goal = byTitle.get(title.trim().toLowerCase(Locale.ROOT));
            if (goal == null) continue;
            GoalEarmark e = earmarks.findByGoalAndMonthAndSource(goal, month, GoalEarmark.SPEND_GUARD)
                    .orElseGet(GoalEarmark::new);
            e.setUser(user);
            e.setGoal(goal);
            e.setMonth(month);
            e.setAmount(amount);
            e.setSource(GoalEarmark.SPEND_GUARD);
            if (e.getCreatedAt() == null) e.setCreatedAt(LocalDateTime.now());
            earmarks.save(e);
            count++;
        }
        return count;
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /** Trimmed, control characters removed, cut to max; null when empty. */
    static String text(Object value, int max) {
        if (value == null) return null;
        String s = value.toString().replaceAll("\\p{Cntrl}", " ").replaceAll("\\s+", " ").trim();
        if (s.isEmpty()) return null;
        return s.length() > max ? s.substring(0, max).trim() : s;
    }

    /** A positive rupee amount to the paisa, up to ₹1 crore; null otherwise. Callers apply their own cap. */
    static BigDecimal money(Object value) {
        if (value == null) return null;
        try {
            BigDecimal b = new BigDecimal(value.toString().trim()).setScale(2, RoundingMode.HALF_UP);
            return b.signum() > 0 && b.compareTo(BigDecimal.valueOf(MAX_EARMARK)) <= 0 ? b : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private boolean jsonObject(String raw, int maxChars) {
        if (raw == null || raw.length() > maxChars) return false;
        try {
            JsonNode n = mapper.readTree(raw);
            return n != null && n.isObject();
        } catch (Exception e) {
            return false;
        }
    }
}
