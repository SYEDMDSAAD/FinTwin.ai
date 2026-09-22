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
    private static final String[] SELF_TRANSFER_MARKERS = {
            "self transfer", "self-transfer", "own account", "transfer to self"
    };

    /**
     * Category stamped on both legs of a credit-card bill payment: the debit
     * leaving the bank account, and the matching credit on the card.
     *
     * Card bill payments used to be counted as ordinary spending on purpose —
     * with no card sync, the bill was the only visible trace of that month's
     * card purchases. Now that CREDIT_CARD is part of the AA consent, the
     * individual purchases arrive on their own, so counting the bill as well
     * would charge the same rupee twice: once as the purchase, once as the
     * repayment. Neither leg is spending in its own right, so both are
     * excluded wherever self-transfers are.
     *
     * The category is only ever assigned when card data is actually present
     * for that user (see BankConnectionService), so a user with no card
     * connected keeps the old behaviour and their bill payment still counts.
     */
    public static final String CARD_PAYMENT_CATEGORY = "Card Payment";

    /** True when the transaction is one leg of a credit-card bill payment. */
    public static boolean isCardBillPayment(Transaction t) {
        return CARD_PAYMENT_CATEGORY.equalsIgnoreCase(t.getCategory());
    }

    // Bank-side narrations for a credit-card bill payment. Deliberately narrow:
    // a false positive here silently erases real spending from every aggregate.
    private static final String[] CARD_PAYMENT_MARKERS = {
            "credit card payment", "creditcard payment", "cc payment", "card payment",
            "payment to credit card", "cc bill", "credit card bill", "bbps cc",
            "autopay si-tad", "cred club", "cred.club"
    };

    // Card-side credits that are money coming back rather than a repayment.
    private static final String[] REFUND_MARKERS = {
            "refund", "reversal", "reversed", "chargeback", "cashback",
            "cash back", "returned", "disputed"
    };

    /** True when a bank-side narration names a credit-card bill payment. */
    public static boolean matchesCardPayment(String narration) {
        return containsAny(narration, CARD_PAYMENT_MARKERS);
    }

    /** True when a card-side credit is a refund or cashback, not a repayment. */
    public static boolean isRefundLike(String narration) {
        return containsAny(narration, REFUND_MARKERS);
    }

    /**
     * Sources whose debits can be the bank-side leg of a card bill payment:
     * AA-synced bank accounts, uploaded bank statements, and bank-account
     * alert emails.
     */
    private static final java.util.Set<String> BANK_SIDE_SOURCES = java.util.Set.of("BANK", "STATEMENT", "EMAIL");

    /**
     * Restamps bank-side debits that are credit-card bill payments, and returns
     * the rows it changed so the caller can persist them.
     *
     * Call only once the user has card purchases on record (AA-synced or from
     * an uploaded card statement). Before that, the bill payment is the only
     * trace of that card spending and must keep counting.
     */
    public static List<Transaction> restampCardBillPayments(List<Transaction> transactions) {
        return transactions.stream()
                .filter(t -> BANK_SIDE_SOURCES.contains(t.getSource()))
                .filter(t -> t.getAmount() != null && t.getAmount() < 0)
                .filter(t -> !isCardBillPayment(t))
                .filter(t -> matchesCardPayment(t.getMerchant()))
                .peek(t -> {
                    if (t.getCategoryReview() == null) {
                        t.applyPrediction(new Categorized(CARD_PAYMENT_CATEGORY, Categorized.FORCED));
                    } else {
                        t.setCategory(CARD_PAYMENT_CATEGORY);
                    }
                })
                .toList();
    }

    /**
     * The category card bookkeeping forces on an incoming transaction, or null
     * when ordinary categorisation should decide. Shared by statement imports
     * and alert emails so the same money lands in the same place either way.
     *
     * A card credit is the user repaying the bill (neither spending nor
     * income) or money coming back from a merchant; a bank-side debit that
     * pays a card bill is excluded once that card's purchases are on record.
     */
    public static String forcedImportCategory(String narration, double amount,
                                              boolean isCard, boolean cardDataPresent) {
        boolean isCredit = amount > 0;
        if (isCard && isCredit) {
            return isRefundLike(narration) ? "Other" : CARD_PAYMENT_CATEGORY;
        }
        if (!isCard && !isCredit && cardDataPresent && matchesCardPayment(narration)) {
            return CARD_PAYMENT_CATEGORY;
        }
        return null;
    }

    private static boolean containsAny(String text, String[] markers) {
        if (text == null) return false;
        String lower = text.toLowerCase();
        for (String marker : markers) {
            if (lower.contains(marker)) return true;
        }
        return false;
    }

    /**
     * True when the transaction should be kept out of income and expense
     * aggregates — money moved between the user's own accounts, or either leg
     * of a credit-card bill payment.
     */
    public static boolean isSelfTransfer(Transaction t) {
        if ("Transfer".equalsIgnoreCase(t.getCategory())) return true;
        if (isCardBillPayment(t)) return true;
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
