package com.fintwin.util;

import com.fintwin.model.Transaction;

import java.time.YearMonth;
import java.util.List;
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
}
