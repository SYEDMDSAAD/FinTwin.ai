package com.fintwin.util;

import com.fintwin.model.Transaction;

import java.time.YearMonth;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Shared math over transaction windows. The 3-month window query can return
 * fewer than 3 months of data (new users, sparse history) — dividing totals
 * by a hardcoded 3.0 understates monthly averages by up to 3x. Always divide
 * by the number of months actually present.
 */
public final class TransactionMath {

    private TransactionMath() {}

    /** Number of distinct calendar months present in the window; never below 1. */
    public static int monthsPresent(List<Transaction> transactions) {
        long distinct = transactions.stream()
                .map(Transaction::getDate)
                .filter(Objects::nonNull)
                .map(YearMonth::from)
                .distinct()
                .count();
        return (int) Math.max(1, distinct);
    }

    // Conservative markers for money moving between the user's own accounts.
    // Both legs of such a move can be visible (or just the incoming one),
    // inflating income and expenses — and every ratio built on them.
    // Credit-card bill payments are deliberately NOT excluded: card
    // transactions aren't synced separately, so the bill payment is the only
    // visible trace of that spending.
    private static final String[] SELF_TRANSFER_MARKERS = {
            "self transfer", "self-transfer", "own account", "transfer to self"
    };

    /** True when the transaction is money moved between the user's own accounts. */
    public static boolean isSelfTransfer(Transaction t) {
        if ("Transfer".equalsIgnoreCase(t.getCategory())) return true;
        String m = t.getMerchant();
        if (m == null) return false;
        String lower = m.toLowerCase();
        for (String marker : SELF_TRANSFER_MARKERS) {
            if (lower.contains(marker)) return true;
        }
        return false;
    }

    /** Sum of positive amounts, excluding nulls and self-transfers. */
    public static double income(List<Transaction> transactions) {
        return transactions.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() > 0)
                .filter(t -> !isSelfTransfer(t))
                .mapToDouble(Transaction::getAmount)
                .sum();
    }

    /** Sum of |negative amounts|, excluding nulls and self-transfers. */
    public static double expenses(List<Transaction> transactions) {
        return transactions.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() < 0)
                .filter(t -> !isSelfTransfer(t))
                .mapToDouble(t -> Math.abs(t.getAmount()))
                .sum();
    }

    /**
     * Net savings (income minus expenses) per calendar month, self-transfers
     * excluded. A month the user overspent comes out negative — callers decide
     * whether that debits anything. Dateless transactions are ignored: a saved
     * rupee only counts once it belongs to a month.
     */
    public static Map<YearMonth, Double> netSavingsByMonth(List<Transaction> transactions) {
        Map<YearMonth, Double> byMonth = new HashMap<>();
        for (Transaction t : transactions) {
            if (t.getAmount() == null || t.getDate() == null) continue;
            if (isSelfTransfer(t)) continue;
            byMonth.merge(YearMonth.from(t.getDate()), t.getAmount(), Double::sum);
        }
        return byMonth;
    }

    /**
     * The largest single month's share of total income, 0-100.
     *
     * Zero when there is no income to measure. Months without a date are
     * ignored, since a share is only meaningful against a month it belongs to.
     */
    public static double incomeConcentration(List<Transaction> transactions) {
        double total = income(transactions);
        if (total <= 0) return 0.0;

        Map<YearMonth, Double> byMonth = new HashMap<>();
        for (Transaction t : transactions) {
            if (t.getAmount() == null || t.getAmount() <= 0) continue;
            if (t.getDate() == null || isSelfTransfer(t)) continue;
            byMonth.merge(YearMonth.from(t.getDate()), t.getAmount(), Double::sum);
        }
        double biggest = byMonth.values().stream().mapToDouble(Double::doubleValue).max().orElse(0.0);
        return biggest / total * 100.0;
    }

    /**
     * Whether recorded income behaves like earnings rather than an imported balance.
     *
     * Mirrors the rule in ai-service (`spending_coach/analysis.py: data_quality`)
     * so both paths reach the same verdict on the same window: income is only
     * believable as earnings when it arrives the way earnings do — every month,
     * at a similar size. One month holding nearly all of it across a multi-month
     * window is the signature of a whole account history credited on the import
     * date, and everything derived from income is withheld rather than reported
     * from a number that is not earnings.
     */
    public static boolean incomeReliable(List<Transaction> transactions) {
        if (income(transactions) <= 0) return false;
        return !(monthsPresent(transactions) >= 2
                 && incomeConcentration(transactions) >= 80.0);
    }
}
