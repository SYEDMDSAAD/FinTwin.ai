package com.fintwin.service;

import com.fintwin.dto.AnomalyDTO;
import com.fintwin.dto.DismissAnomalyRequest;
import com.fintwin.exception.NotFoundException;
import com.fintwin.model.DismissedAnomalyPattern;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.DismissedAnomalyRepository;
import com.fintwin.repository.AnomalyFeedbackRepository;
import com.fintwin.model.AnomalyFeedback;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class AnomalyService {

    private final TransactionRepository      transactionRepository;
    private final UserRepository             userRepository;
    private final DismissedAnomalyRepository dismissedRepository;
    private final AnomalyFeedbackRepository  feedbackRepository;

    public AnomalyService(TransactionRepository transactionRepository,
                          UserRepository userRepository,
                          DismissedAnomalyRepository dismissedRepository,
                          AnomalyFeedbackRepository feedbackRepository) {
        this.transactionRepository = transactionRepository;
        this.userRepository        = userRepository;
        this.dismissedRepository   = dismissedRepository;
        this.feedbackRepository    = feedbackRepository;
    }

    /** "Yes, that was odd": the alert was right. Recorded only — the alert isn't suppressed. */
    @PreAuthorize("hasAuthority('WRITE_OWN_TRANSACTIONS')")
    public void confirmAnomaly(DismissAnomalyRequest req) {
        User user = userRepository.findByEmail(SecurityUtils.getCurrentUserEmail()).orElseThrow();
        recordVerdict(user, req, AnomalyFeedback.CONFIRMED);
    }

    /**
     * The user's verdict on one alert, with the figures that raised it — so
     * false alarms can be counted per kind of alert and, with consent, used
     * to tune the thresholds. The latest verdict on the same alert wins.
     */
    private void recordVerdict(User user, DismissAnomalyRequest req, String verdict) {
        String key = patternKey(user.getId(), req.getType(), req.getMerchant(), req.getAmount());
        AnomalyFeedback f = feedbackRepository.findByUserAndPatternKey(user, key).orElseGet(AnomalyFeedback::new);
        f.setUser(user);
        f.setPatternKey(key);
        f.setVerdict(verdict);
        f.setAnomalyType(trim(req.getType(), 40));
        f.setMerchant(req.getMerchant());
        f.setCategory(trim(req.getCategory(), 100));
        f.setAmount(req.getAmount() == null ? null : java.math.BigDecimal.valueOf(req.getAmount()));
        f.setAvgAmount(req.getAvgAmount() == null ? null : java.math.BigDecimal.valueOf(req.getAvgAmount()));
        f.setMultiplier(req.getMultiplier());
        f.setSeverity(trim(req.getSeverity(), 10));
        f.setCreatedAt(java.time.LocalDateTime.now());
        feedbackRepository.save(f);
    }

    static String patternKey(Long userId, String type, String merchant, Double amount) {
        String raw = userId + "|" + (type == null ? "" : type) + "|"
                + (merchant == null ? "" : merchant.trim().toLowerCase()) + "|"
                + (amount == null ? "" : Math.round(amount * 100));
        try {
            byte[] h = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(h);
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String trim(String s, int max) {
        return s == null ? null : s.length() > max ? s.substring(0, max) : s;
    }

    /** Admin: per kind of alert, how often users confirmed it versus called it a false alarm. */
    public Map<String, Object> feedbackStats() {
        return feedbackStats(feedbackRepository.countVerdicts());
    }

    static Map<String, Object> feedbackStats(List<Object[]> rows) {
        Map<String, long[]> byType = new TreeMap<>();      // type → [confirmed, not anomaly]
        long confirmed = 0, falseAlarms = 0;
        for (Object[] r : rows) {
            String type = r[0] == null ? "unknown" : (String) r[0];
            long n = ((Number) r[3]).longValue();
            long[] c = byType.computeIfAbsent(type, k -> new long[2]);
            if (AnomalyFeedback.CONFIRMED.equals(r[2])) { c[0] += n; confirmed += n; }
            else { c[1] += n; falseAlarms += n; }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("confirmed", confirmed);
        out.put("falseAlarms", falseAlarms);
        out.put("falseAlarmRate", confirmed + falseAlarms == 0 ? null
                : Math.round(falseAlarms * 1000.0 / (confirmed + falseAlarms)) / 10.0);
        out.put("byType", byType.entrySet().stream().map(e -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("type", e.getKey());
            m.put("confirmed", e.getValue()[0]);
            m.put("falseAlarms", e.getValue()[1]);
            m.put("falseAlarmRate", Math.round(e.getValue()[1] * 1000.0 / (e.getValue()[0] + e.getValue()[1])) / 10.0);
            return m;
        }).toList());
        return out;
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_TRANSACTIONS')")
    public void dismissAnomaly(DismissAnomalyRequest req) {
        String email = SecurityUtils.getCurrentUserEmail();
        User user = userRepository.findByEmail(email).orElseThrow();
        String merchant = req.getMerchant() != null ? req.getMerchant() : "";
        String type     = req.getType()     != null ? req.getType()     : "";
        recordVerdict(user, req, AnomalyFeedback.NOT_ANOMALY);
        if (dismissedRepository.existsByUserAndAnomalyTypeAndMerchant(user, type, merchant)) return;
        DismissedAnomalyPattern p = new DismissedAnomalyPattern();
        p.setUser(user);
        p.setAnomalyType(type);
        p.setMerchant(merchant);
        p.setCategory(req.getCategory());
        dismissedRepository.save(p);
    }

    @PreAuthorize("hasAuthority('READ_OWN_TRANSACTIONS')")
    public List<AnomalyDTO> detectAnomalies() {

        String email = SecurityUtils.getCurrentUserEmail();
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new NotFoundException("User not found"));

        Set<String> dismissed = dismissedRepository.findByUser(user).stream()
                .map(p -> p.getAnomalyType() + "|" + (p.getMerchant() != null ? p.getMerchant() : ""))
                .collect(Collectors.toSet());

        List<Transaction> transactions = transactionRepository.findLatestThreeMonthsTransactions(user.getId());
        List<Transaction> expenses = transactions.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() < 0)
                .toList();

        if (expenses.isEmpty()) return List.of();

        double globalAvg = expenses.stream()
                .mapToDouble(t -> Math.abs(t.getAmount())).average().orElse(0);

        List<AnomalyDTO> anomalies = new ArrayList<>();

        // ── 1. Merchant spike: latest tx vs this merchant's average ──────
        Map<String, List<Transaction>> byMerchant = expenses.stream()
                .filter(t -> t.getMerchant() != null && !t.getMerchant().isBlank())
                .collect(Collectors.groupingBy(Transaction::getMerchant));

        for (Map.Entry<String, List<Transaction>> entry : byMerchant.entrySet()) {
            String merchant = entry.getKey();
            List<Transaction> mtxns = entry.getValue();
            if (mtxns.size() < 3) continue;

            double avg = mtxns.stream().mapToDouble(t -> Math.abs(t.getAmount())).average().orElse(0);
            Transaction latest = mtxns.stream()
                    .max(Comparator.comparing(Transaction::getDate,
                            Comparator.nullsFirst(Comparator.naturalOrder())))
                    .orElse(mtxns.get(mtxns.size() - 1));

            double latestAmt = Math.abs(latest.getAmount());
            if (avg == 0) continue;
            double multiplier = latestAmt / avg;
            if (multiplier < 2.0) continue;

            String severity = multiplier >= 4.0 ? "high" : multiplier >= 3.0 ? "medium" : "low";
            String reason = "Your latest transaction at " + merchant + " was ₹" + Math.round(latestAmt)
                    + " — " + fmt(multiplier) + "x your usual ₹" + Math.round(avg)
                    + ". This could be a billing error, an unauthorised charge, or a one-time large purchase worth verifying.";

            anomalies.add(new AnomalyDTO(
                    merchant, latestAmt, Math.round(multiplier * 10.0) / 10.0,
                    severity, latest.getCategory(), reason, Math.round(avg * 100.0) / 100.0,
                    "merchant_spike"
            ));
        }

        // ── 2. Category monthly spike: this month vs prior 2-month average ─
        String thisMonth = LocalDate.now().toString().substring(0, 7);
        Map<String, Double> thisMonthCat = expenses.stream()
                .filter(t -> t.getDate() != null && t.getDate().toString().startsWith(thisMonth) && t.getCategory() != null)
                .collect(Collectors.groupingBy(Transaction::getCategory,
                        Collectors.summingDouble(t -> Math.abs(t.getAmount()))));

        List<Transaction> priorExpenses = expenses.stream()
                .filter(t -> t.getDate() != null && !t.getDate().toString().startsWith(thisMonth) && t.getCategory() != null)
                .toList();
        Map<String, Double> priorCat = priorExpenses.stream()
                .collect(Collectors.groupingBy(Transaction::getCategory,
                        Collectors.summingDouble(t -> Math.abs(t.getAmount()))));
        // Average over the prior months actually present — dividing by a fixed
        // 2 halved the baseline when only 1 prior month existed, inflating
        // spike ratios and causing false alarms for new users.
        int priorMonths = com.fintwin.util.TransactionMath.monthsPresent(priorExpenses);

        for (Map.Entry<String, Double> entry : thisMonthCat.entrySet()) {
            String cat = entry.getKey();
            double thisAmt = entry.getValue();
            double priorAvg = priorCat.getOrDefault(cat, 0.0) / priorMonths;
            if (priorAvg < 500) continue; // not enough history
            double ratio = thisAmt / priorAvg;
            if (ratio < 1.8) continue;

            String severity = ratio >= 3.0 ? "high" : ratio >= 2.3 ? "medium" : "low";
            String reason = cat + " spending this month is ₹" + Math.round(thisAmt)
                    + " — " + fmt(ratio) + "x your prior 2-month average of ₹" + Math.round(priorAvg)
                    + " per month. Review this category for any unexpected charges.";

            anomalies.add(new AnomalyDTO(
                    cat + " (category)", thisAmt, Math.round(ratio * 10.0) / 10.0,
                    severity, cat, reason, Math.round(priorAvg * 100.0) / 100.0,
                    "category_spike"
            ));
        }

        // ── 3. Unusually large single transaction ────────────────────────
        for (Transaction t : expenses) {
            double amt = Math.abs(t.getAmount());
            if (globalAvg == 0 || amt < 1000) continue;
            double ratio = amt / globalAvg;
            if (ratio < 5.0) continue;

            // don't duplicate a merchant_spike already flagged for the same tx
            boolean alreadyFlagged = anomalies.stream().anyMatch(a ->
                    a.getType().equals("merchant_spike")
                    && t.getMerchant() != null
                    && a.getMerchant().equals(t.getMerchant())
                    && Math.abs(a.getAmount() - amt) < 1.0
            );
            if (alreadyFlagged) continue;

            String severity = ratio >= 10.0 ? "high" : ratio >= 7.0 ? "medium" : "low";
            String label = t.getMerchant() != null ? t.getMerchant() : (t.getCategory() != null ? t.getCategory() : "Unknown");
            String reason = "A single transaction of ₹" + Math.round(amt) + " at " + label
                    + " is " + fmt(ratio) + "x your average transaction size of ₹" + Math.round(globalAvg)
                    + ". Large one-off transactions are worth a manual review.";

            anomalies.add(new AnomalyDTO(
                    label, amt, Math.round(ratio * 10.0) / 10.0,
                    severity, t.getCategory(), reason, Math.round(globalAvg * 100.0) / 100.0,
                    "large_transaction"
            ));
        }

        // ── 4. Spending burst: 5+ transactions on a single day ───────────
        Map<LocalDate, Long> txPerDay = expenses.stream()
                .filter(t -> t.getDate() != null)
                .collect(Collectors.groupingBy(Transaction::getDate, Collectors.counting()));

        txPerDay.entrySet().stream()
                .filter(e -> e.getValue() >= 5)
                .forEach(e -> {
                    double dayTotal = expenses.stream()
                            .filter(t -> e.getKey().equals(t.getDate()))
                            .mapToDouble(t -> Math.abs(t.getAmount())).sum();
                    String reason = e.getValue() + " transactions totalling ₹" + Math.round(dayTotal)
                            + " were recorded on " + e.getKey()
                            + ". A concentrated spending burst on a single day can indicate impulse purchases or a compromised card.";
                    anomalies.add(new AnomalyDTO(
                            "Spending Burst — " + e.getKey(), dayTotal,
                            Math.round(e.getValue() * 10.0) / 10.0,
                            e.getValue() >= 8 ? "high" : "medium",
                            "Multiple", reason, null, "burst"
                    ));
                });

        // Deduplicate by merchant+type, sort by severity then amount
        Map<String, AnomalyDTO> deduped = new LinkedHashMap<>();
        for (AnomalyDTO a : anomalies) {
            String key = a.getMerchant() + "|" + a.getType();
            deduped.putIfAbsent(key, a);
        }

        List<AnomalyDTO> result = new ArrayList<>(deduped.values());
        result.removeIf(a -> dismissed.contains(a.getType() + "|" + (a.getMerchant() != null ? a.getMerchant() : "")));
        result.sort(Comparator
                .comparingInt((AnomalyDTO a) -> severityRank(a.getSeverity()))
                .thenComparingDouble(a -> -a.getAmount()));

        return result.stream().limit(8).toList();
    }

    private int severityRank(String s) {
        if ("high".equals(s)) return 1;
        if ("medium".equals(s)) return 2;
        return 3;
    }

    private String fmt(double v) {
        return String.valueOf(Math.round(v * 10) / 10.0);
    }
}
