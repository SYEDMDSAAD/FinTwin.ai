package com.fintwin.util;

import com.fintwin.model.Transaction;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * How complete the user's data is, per account: live through alert emails,
 * covered by statements up to some date, or missing a month.
 *
 * Without an Account Aggregator link nothing arrives by itself, so the app has
 * to be honest about gaps — a month with no statement looks exactly like a
 * month with no spending unless someone says so.
 */
public final class CoverageMath {

    private CoverageMath() {}

    /** Alerts within this many days mean the account is being kept current. */
    public static final int LIVE_WITHIN_DAYS = 14;
    /** How far back missing statement months are reported. */
    public static final int LOOKBACK_MONTHS = 6;

    public enum Status { LIVE, CURRENT, BEHIND }

    public record AccountCoverage(String account, boolean card, Status status,
                                  LocalDate lastTransaction, LocalDate statementsUpTo,
                                  LocalDate lastAlert, List<YearMonth> missingMonths) {

        /** The month to nudge about ("upload your August statement"), or null. */
        public YearMonth nudgeFor(LocalDate today) {
            YearMonth previous = YearMonth.from(today).minusMonths(1);
            boolean usesStatements = statementsUpTo != null;
            // From the 2nd: the 1st is often before the bank publishes the statement
            return usesStatements && status != Status.LIVE && today.getDayOfMonth() >= 2
                    && missingMonths.contains(previous) ? previous : null;
        }
    }

    // Labels for rows that carry no account of their own
    static final String UNLABELLED_BANK = "Bank statements";
    static final String UNLABELLED_CARD = "Card statements";
    static final String LINKED_BANK = "Linked bank (sandbox)";

    public static List<AccountCoverage> coverage(List<Transaction> transactions, LocalDate today) {
        Map<String, List<Transaction>> byAccount = new LinkedHashMap<>();
        for (Transaction t : transactions) {
            String account = accountOf(t);
            if (account != null && t.getDate() != null) {
                byAccount.computeIfAbsent(account, k -> new ArrayList<>()).add(t);
            }
        }

        List<AccountCoverage> out = new ArrayList<>();
        for (Map.Entry<String, List<Transaction>> e : byAccount.entrySet()) {
            out.add(summarise(e.getKey(), e.getValue(), today));
        }
        // Accounts needing attention first, then most recently active
        out.sort(Comparator.comparing((AccountCoverage c) -> c.status() != Status.BEHIND)
                .thenComparing(AccountCoverage::lastTransaction, Comparator.reverseOrder()));
        return out;
    }

    private static AccountCoverage summarise(String account, List<Transaction> rows, LocalDate today) {
        boolean card = rows.stream().anyMatch(t -> "CARD".equals(t.getSource()));
        LocalDate last = rows.stream().map(Transaction::getDate).max(LocalDate::compareTo).orElse(null);
        LocalDate lastAlert = rows.stream().filter(CoverageMath::fromAlert)
                .map(Transaction::getDate).max(LocalDate::compareTo).orElse(null);

        Set<YearMonth> statementMonths = new TreeSet<>();
        LocalDate statementsUpTo = null;
        for (Transaction t : rows) {
            if (!fromStatement(t)) continue;
            statementMonths.add(YearMonth.from(t.getDate()));
            if (statementsUpTo == null || t.getDate().isAfter(statementsUpTo)) statementsUpTo = t.getDate();
        }

        List<YearMonth> missing = new ArrayList<>();
        if (!statementMonths.isEmpty()) {
            YearMonth first = ((TreeSet<YearMonth>) statementMonths).first();
            YearMonth lastComplete = YearMonth.from(today).minusMonths(1);
            YearMonth from = max(first, lastComplete.minusMonths(LOOKBACK_MONTHS - 1));
            for (YearMonth m = from; !m.isAfter(lastComplete); m = m.plusMonths(1)) {
                if (!statementMonths.contains(m)) missing.add(m);
            }
        }

        boolean live = lastAlert != null && !lastAlert.isBefore(today.minusDays(LIVE_WITHIN_DAYS));
        boolean linked = rows.stream().anyMatch(CoverageMath::fromBankLink);
        Status status = live || linked ? Status.LIVE
                : statementsUpTo != null && !YearMonth.from(statementsUpTo).isBefore(YearMonth.from(today).minusMonths(1))
                        ? Status.CURRENT
                        : Status.BEHIND;

        return new AccountCoverage(account, card, status, last, statementsUpTo, lastAlert, missing);
    }

    private static YearMonth max(YearMonth a, YearMonth b) {
        return a.isAfter(b) ? a : b;
    }

    private static String accountOf(Transaction t) {
        if (t.getAccountRef() != null && !t.getAccountRef().isBlank()) return t.getAccountRef();
        if (fromStatement(t)) return "CARD".equals(t.getSource()) ? UNLABELLED_CARD : UNLABELLED_BANK;
        if (fromBankLink(t)) return LINKED_BANK;
        return null;    // manual entries, receipts, seeded demo data
    }

    static boolean fromStatement(Transaction t) {
        return startsWith(t.getExternalId(), StatementImport.EXTERNAL_ID_PREFIX);
    }

    static boolean fromAlert(Transaction t) {
        return startsWith(t.getExternalId(), "MAIL:");
    }

    // Account Aggregator rows: bank or card source with the Setu txn id
    static boolean fromBankLink(Transaction t) {
        return ("BANK".equals(t.getSource()) || "CARD".equals(t.getSource()))
                && t.getExternalId() != null && !fromStatement(t) && !fromAlert(t);
    }

    private static boolean startsWith(String s, String prefix) {
        return s != null && s.startsWith(prefix);
    }

    /** "August", or "August 2025" when it isn't this year. */
    public static String monthName(YearMonth m, LocalDate today) {
        String name = m.getMonth().getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.ENGLISH);
        return m.getYear() == today.getYear() ? name : name + " " + m.getYear();
    }
}
