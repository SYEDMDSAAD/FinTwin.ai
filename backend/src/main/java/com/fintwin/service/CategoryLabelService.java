package com.fintwin.service;

import com.fintwin.exception.NotFoundException;
import com.fintwin.model.User;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import com.fintwin.util.Categorized;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * The categorisation labels collected during beta: the user's opt-in to
 * training, and how accurate each categorisation method has been so far.
 */
@Service
public class CategoryLabelService {

    /**
     * Channels whose transactions can't be training examples: AA is the Setu
     * sandbox's random sample data (revisit when a real AA goes live), and
     * SEED is onboarding's own.
     */
    static final Set<String> NOT_REAL = Set.of("AA", "SEED");

    /** Categories that weren't a guess about the merchant, so say nothing about accuracy. */
    static final Set<String> NOT_PREDICTIONS = Set.of(Categorized.USER, Categorized.SEED);

    private final TransactionRepository transactions;
    private final UserRepository users;

    public CategoryLabelService(TransactionRepository transactions, UserRepository users) {
        this.transactions = transactions;
        this.users = users;
    }

    // ── The user's opt-in ─────────────────────────────────────────────────────

    public Map<String, Object> consent() {
        return consentBody(currentUser());
    }

    @Transactional
    public Map<String, Object> setConsent(boolean given) {
        User user = currentUser();
        if (given && user.getTrainingConsentAt() == null) user.setTrainingConsentAt(LocalDateTime.now());
        if (!given) user.setTrainingConsentAt(null);
        users.save(user);
        return consentBody(user);
    }

    private static Map<String, Object> consentBody(User user) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("given", user.getTrainingConsentAt() != null);
        m.put("givenAt", user.getTrainingConsentAt());
        return m;
    }

    private User currentUser() {
        return users.findByEmail(SecurityUtils.getCurrentUserEmail())
                .orElseThrow(() -> new NotFoundException("User not found"));
    }

    // ── Admin: how each method is doing ───────────────────────────────────────

    public Map<String, Object> stats() {
        return stats(transactions.countCategoryLabels(), users.countByTrainingConsentAtIsNotNull());
    }

    /**
     * Per method: how many transactions it categorised, how many the user
     * then looked at, and how often they had to correct it. The correction
     * rate counts only single, explicit reviews — a bulk "apply to similar"
     * says what the user wanted but not that they checked each row.
     */
    static Map<String, Object> stats(List<Object[]> rows, long consentingUsers) {
        Map<String, long[]> byMethod = new TreeMap<>();     // method → [total, corrected, confirmed, applied]
        long total = 0, reviewed = 0, trainingReady = 0, sandbox = 0;

        for (Object[] r : rows) {
            String channel = (String) r[0];
            String method = r[1] == null ? "UNRECORDED" : (String) r[1];
            String review = (String) r[2];
            boolean consented = Boolean.TRUE.equals(r[3]);
            long n = ((Number) r[4]).longValue();

            total += n;
            boolean real = !NOT_REAL.contains(channel) && !Categorized.SEED.equals(method);
            if (!real) { sandbox += n; continue; }

            long[] c = byMethod.computeIfAbsent(method, k -> new long[4]);
            c[0] += n;
            if (review != null) reviewed += n;
            if (Categorized.CORRECTED.equals(review)) c[1] += n;
            else if (Categorized.CONFIRMED.equals(review)) c[2] += n;
            else if (Categorized.APPLIED.equals(review)) c[3] += n;
            if (consented && review != null) trainingReady += n;
        }

        List<Map<String, Object>> methods = byMethod.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue()[0], a.getValue()[0]))
                .map(e -> {
                    long[] c = e.getValue();
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("method", e.getKey());
                    m.put("transactions", c[0]);
                    m.put("corrected", c[1]);
                    m.put("confirmed", c[2]);
                    m.put("appliedToSimilar", c[3]);
                    long judged = c[1] + c[2];
                    m.put("correctionRate", NOT_PREDICTIONS.contains(e.getKey()) || judged == 0
                            ? null : Math.round(c[1] * 1000.0 / judged) / 10.0);
                    return m;
                }).toList();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("transactions", total);
        out.put("excludedSampleData", sandbox);
        out.put("reviewedByUsers", reviewed);
        out.put("trainingReadyLabels", trainingReady);
        out.put("usersConsentedToTraining", consentingUsers);
        out.put("methods", methods);
        return out;
    }
}
