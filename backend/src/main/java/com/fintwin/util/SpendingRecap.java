package com.fintwin.util;

import com.fintwin.model.Transaction;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Turns "what did I spend since I last looked" into sentences.
 *
 * Every other surface in the app answers a question the user has to already
 * know how to ask — how is my savings rate, what is my net worth, am I on
 * track for this goal. Those are monthly questions. This one answers the
 * question people actually have daily, and answers it in words rather than in
 * a table they have to read.
 *
 * Deterministic on purpose: no LLM call. The recap is the first thing the user
 * sees, so it has to render when the AI service is down, and it must say the
 * same thing twice if nothing changed.
 */
public final class SpendingRecap {

    private SpendingRecap() {}

    /** How far back a first-time recap reaches, before there is a last-seen mark. */
    public static final int FIRST_VISIT_DAYS = 30;

    /** Charges further out than this are not yet worth warning about. */
    public static final int UPCOMING_HORIZON_DAYS = 7;

    /** Below this the pace comparison is noise, not a signal. */
    private static final double PACE_SIGNIFICANCE = 0.20;

    public record Recap(
            String       periodLabel,
            double       totalSpent,
            int          chargeCount,
            String       headline,
            List<String> lines,
            boolean      firstVisit
    ) {}

    // ── Headline ──────────────────────────────────────────────────────────────

    /**
     * Builds the recap.
     *
     * @param window   charges since the user last looked
     * @param baseline a longer run of charges the window is judged against,
     *                 for "is this a normal few days or not"
     * @param upcoming recurring charges due soon, newest cadence data
     * @param since    when the user last read a recap, or null on a first visit
     * @param now      passed in rather than read from the clock, so it is testable
     */
    public static Recap build(List<Transaction> window,
                              List<Transaction> baseline,
                              List<RecurringMath.Recurrence> upcoming,
                              LocalDateTime since,
                              LocalDateTime now) {

        boolean firstVisit = since == null;
        String period = periodLabel(since, now);

        List<Transaction> charges = spendOnly(window);
        double total = charges.stream().mapToDouble(t -> Math.abs(t.getAmount())).sum();

        String headline = charges.isEmpty()
                ? "Nothing new " + period + "."
                : "You spent " + money(total) + " " + period + ".";

        List<String> lines = new ArrayList<>();
        if (!charges.isEmpty()) {
            addTopCategory(lines, charges, total);
            addLargestCharge(lines, charges);
            addPace(lines, charges, baseline, since, now);
        }
        addUpcoming(lines, upcoming, now);

        if (lines.isEmpty() && charges.isEmpty()) {
            lines.add("No new charges have come in since you last checked.");
        }

        return new Recap(period, round2(total), charges.size(), headline, lines, firstVisit);
    }

    // ── The individual sentences ──────────────────────────────────────────────

    private static void addTopCategory(List<String> lines, List<Transaction> charges, double total) {
        Map<String, Double> byCategory = charges.stream()
                .filter(t -> t.getCategory() != null)
                .collect(Collectors.groupingBy(
                        Transaction::getCategory,
                        Collectors.summingDouble(t -> Math.abs(t.getAmount()))));

        if (byCategory.isEmpty() || total <= 0) return;

        Map.Entry<String, Double> top = byCategory.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .orElse(null);
        if (top == null) return;

        int share = (int) Math.round(top.getValue() / total * 100);

        // Only worth calling out when one category actually dominates —
        // "most of it" is a lie when the top slice is a fifth of the total.
        if (share >= 40) {
            lines.add("Most of it — " + money(top.getValue()) + " — went on "
                      + top.getKey().toLowerCase() + ".");
        } else {
            lines.add("Your biggest category was " + top.getKey().toLowerCase()
                      + " at " + money(top.getValue()) + ".");
        }
    }

    private static void addLargestCharge(List<String> lines, List<Transaction> charges) {
        // With only a couple of charges the largest is already on screen and
        // naming it just repeats the list back at the user.
        if (charges.size() < 3) return;

        Transaction largest = charges.stream()
                .max(Comparator.comparingDouble(t -> Math.abs(t.getAmount())))
                .orElse(null);
        if (largest == null) return;

        String when = largest.getDate() != null
                ? " on " + largest.getDate().getDayOfWeek()
                        .getDisplayName(TextStyle.FULL, Locale.ENGLISH)
                : "";

        lines.add("The largest single charge was " + money(Math.abs(largest.getAmount()))
                  + " at " + cleanMerchant(largest.getMerchant()) + when + ".");
    }

    private static void addPace(List<String> lines, List<Transaction> charges,
                                List<Transaction> baseline,
                                LocalDateTime since, LocalDateTime now) {

        long windowDays = Math.max(1, daysBetween(since, now));
        double perDay = charges.stream().mapToDouble(t -> Math.abs(t.getAmount())).sum() / windowDays;

        Double usual = usualDailySpend(baseline, now);
        if (usual == null || usual <= 0) return;

        double delta = (perDay - usual) / usual;
        if (Math.abs(delta) < PACE_SIGNIFICANCE) {
            lines.add("That is about " + money(perDay) + " a day — roughly your usual pace.");
            return;
        }

        int percent = (int) Math.round(Math.abs(delta) * 100);
        String direction = delta > 0 ? "above" : "below";

        lines.add("That is " + money(perDay) + " a day, about " + percent + "% "
                  + direction + " your usual " + money(usual) + ".");
    }

    private static void addUpcoming(List<String> lines,
                                    List<RecurringMath.Recurrence> upcoming,
                                    LocalDateTime now) {
        if (upcoming == null || upcoming.isEmpty()) return;

        LocalDate today = now.toLocalDate();

        List<RecurringMath.Recurrence> due = upcoming.stream()
                .filter(RecurringMath.Recurrence::active)
                .filter(r -> r.nextChargeDate() != null)
                .filter(r -> !r.nextChargeDate().isAfter(today.plusDays(UPCOMING_HORIZON_DAYS)))
                .sorted(Comparator.comparing(RecurringMath.Recurrence::nextChargeDate))
                .toList();

        if (due.isEmpty()) return;

        RecurringMath.Recurrence next = due.get(0);
        String when = describeDueDate(today, next.nextChargeDate());

        if (due.size() == 1) {
            lines.add("Coming up: " + money(next.typicalAmount()) + " to "
                      + cleanMerchant(next.merchant()) + " " + when + ".");
        } else {
            double sum = due.stream().mapToDouble(RecurringMath.Recurrence::typicalAmount).sum();
            lines.add("Coming up: " + due.size() + " recurring charges worth "
                      + money(sum) + " in the next week, starting with "
                      + cleanMerchant(next.merchant()) + " " + when + ".");
        }
    }

    // ── Phrasing helpers ──────────────────────────────────────────────────────

    /**
     * How to refer to the stretch since the user last looked. Named days beat
     * dates at short range — "since Tuesday" is something a person can place
     * without doing arithmetic, "since 02/09" is not.
     */
    static String periodLabel(LocalDateTime since, LocalDateTime now) {
        if (since == null) return "in the last " + FIRST_VISIT_DAYS + " days";

        long days = daysBetween(since, now);

        if (days <= 0) return "today";
        if (days == 1) return "since yesterday";
        if (days < 7)  return "since " + since.getDayOfWeek()
                                    .getDisplayName(TextStyle.FULL, Locale.ENGLISH);
        if (days < 14) return "in the last week";
        if (days < 31) return "in the last few weeks";

        return "since " + since.getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH);
    }

    static String describeDueDate(LocalDate today, LocalDate due) {
        long days = java.time.temporal.ChronoUnit.DAYS.between(today, due);
        if (days <= 0) return "today";
        if (days == 1) return "tomorrow";
        return "in " + days + " days";
    }

    /**
     * Bank narrations are shouted and padded with rail decoration. Title-casing
     * the cleaned name keeps a sentence readable: "at Swiggy", not "at
     * UPI-SWIGGY-8891".
     */
    static String cleanMerchant(String merchant) {
        String normalized = RecurringMath.normalizeMerchant(merchant);
        if (normalized.isEmpty()) return "an unnamed merchant";

        return java.util.Arrays.stream(normalized.split(" "))
                .filter(w -> !w.isEmpty())
                .map(w -> Character.toUpperCase(w.charAt(0)) + w.substring(1))
                .collect(Collectors.joining(" "));
    }

    /**
     * Indian digit grouping, whole rupees — no one reads paise in a sentence.
     *
     * Hand-rolled because neither the en-IN locale nor a DecimalFormat pattern
     * produces lakh grouping: DecimalFormat supports only one grouping size, so
     * "#,##,##0" still yields "1,234,567" where a reader here expects
     * "12,34,567". Last three digits, then twos.
     */
    static String money(double amount) {
        long rupees = Math.round(amount);
        String digits = Long.toString(Math.abs(rupees));
        String sign = rupees < 0 ? "-" : "";

        if (digits.length() <= 3) return sign + "₹" + digits;

        String last3 = digits.substring(digits.length() - 3);
        String rest  = digits.substring(0, digits.length() - 3);

        StringBuilder grouped = new StringBuilder();
        int i = rest.length();
        while (i > 2) {
            grouped.insert(0, "," + rest.substring(i - 2, i));
            i -= 2;
        }
        grouped.insert(0, rest.substring(0, i));

        return sign + "₹" + grouped + "," + last3;
    }

    // ── Numbers ───────────────────────────────────────────────────────────────

    /** Spending only: no credits, no money moved between the user's own accounts. */
    public static List<Transaction> spendOnly(List<Transaction> transactions) {
        if (transactions == null) return List.of();
        return transactions.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() < 0)
                .filter(t -> !TransactionMath.isSelfTransfer(t))
                .sorted(Comparator.comparing(
                        Transaction::getDate, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
    }

    /**
     * Average daily spend over the baseline, measured across the days the
     * baseline actually covers rather than a nominal window — a user with three
     * weeks of history should not be judged against a ninety-day denominator.
     */
    static Double usualDailySpend(List<Transaction> baseline, LocalDateTime now) {
        List<Transaction> charges = spendOnly(baseline);
        if (charges.size() < 5) return null;

        LocalDate earliest = charges.stream()
                .map(Transaction::getDate)
                .filter(java.util.Objects::nonNull)
                .min(LocalDate::compareTo)
                .orElse(null);
        if (earliest == null) return null;

        long span = java.time.temporal.ChronoUnit.DAYS.between(earliest, now.toLocalDate());
        if (span < 7) return null;

        double total = charges.stream().mapToDouble(t -> Math.abs(t.getAmount())).sum();
        return total / span;
    }

    private static long daysBetween(LocalDateTime since, LocalDateTime now) {
        if (since == null) return FIRST_VISIT_DAYS;
        return Math.max(0, Duration.between(since, now).toDays());
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
