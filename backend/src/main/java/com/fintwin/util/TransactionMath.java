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
}
