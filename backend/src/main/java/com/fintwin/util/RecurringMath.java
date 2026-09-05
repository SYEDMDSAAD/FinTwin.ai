package com.fintwin.util;

import com.fintwin.model.Transaction;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Detects recurring charges — subscriptions, rent, EMIs, utility bills — from a
 * merchant's transaction history.
 *
 * The question this answers is not "did this merchant appear in three separate
 * calendar months", which is what the first version asked. That test misses the
 * charges people most want found: an annual subscription bills once, a quarterly
 * one twice a year, and a subscription started six weeks ago has only two
 * charges to its name. It also splits one subscription across several merchant
 * spellings, so each fragment falls below the threshold and none are reported.
 *
 * Instead: normalize the merchant so its spellings collapse, then look for a
 * regular gap between charges of a stable amount. Two charges of the same amount
 * thirty days apart are a subscription; ten irregular charges at a supermarket
 * are not.
 */
public final class RecurringMath {

    private RecurringMath() {}

    // ── Cadence buckets ───────────────────────────────────────────────────────

    /**
     * A recognised billing rhythm. The tolerance is what separates a real cycle
     * from coincidence: billing dates drift by a day or two around weekends and
     * month lengths, but not by a week.
     */
    public record Cadence(String label, int days, int tolerance) {}

    private static final List<Cadence> CADENCES = List.of(
            new Cadence("Weekly",      7,    2),
            new Cadence("Fortnightly", 14,   3),
            new Cadence("Monthly",     30,   5),
            new Cadence("Quarterly",   91,  12),
            new Cadence("Half-yearly", 182, 20),
            new Cadence("Yearly",      365, 30)
    );

    /** A detected recurring charge, with everything needed to act on it. */
    public record Recurrence(
            String    merchant,
            String    cadenceLabel,
            int       cadenceDays,
            double    typicalAmount,
            double    annualisedCost,
            int       occurrences,
            LocalDate lastCharged,
            LocalDate nextChargeDate,
            boolean   amountVaries,
            boolean   active
    ) {}

    // ── Thresholds ────────────────────────────────────────────────────────────

    /**
     * How much a charge may vary and still count as the same subscription.
     * Utility bills and usage-based plans move around; a subscription that
     * doubles is a different thing being billed.
     */
    private static final double AMOUNT_VARIATION_LIMIT = 0.35;

    /**
     * A two-charge series is only accepted when the amounts are near-identical.
     * One gap is thin evidence, so the amounts have to carry it: two ₹649
     * charges thirty days apart are Netflix, two loosely similar charges thirty
     * days apart are a coincidence at a shop.
     */
    private static final double PAIR_VARIATION_LIMIT = 0.05;

    /** Below this the "amount varies" flag is not worth showing. */
    private static final double AMOUNT_STEADY_LIMIT = 0.02;

    /**
     * How far past its due date a charge can drift before the subscription is
     * treated as lapsed rather than upcoming — a missed cycle plus the cadence's
     * own tolerance.
     */
    private static final double LAPSED_CYCLE_MULTIPLIER = 1.8;

    // ── Detection ─────────────────────────────────────────────────────────────

    /**
     * Analyses one merchant's charges. Returns null when they show no regular
     * rhythm. Callers pass the charges for a single normalized merchant; use
     * {@link #normalizeMerchant} to group them.
     *
     * @param today the date to project the next charge from — passed in rather
     *              than read from the clock so the result is testable.
     */
    public static Recurrence detect(String merchant, List<Transaction> charges, LocalDate today) {
        if (charges == null || charges.size() < 2) return null;

        List<Transaction> sorted = charges.stream()
                .filter(t -> t.getDate() != null && t.getAmount() != null)
                .sorted(Comparator.comparing(Transaction::getDate))
                .toList();
        if (sorted.size() < 2) return null;

        // Two charges on the same day are one purchase split, not a cycle.
        List<LocalDate> dates = sorted.stream().map(Transaction::getDate).distinct().toList();
        if (dates.size() < 2) return null;

        List<Long> gaps = new ArrayList<>();
        for (int i = 1; i < dates.size(); i++) {
            gaps.add(ChronoUnit.DAYS.between(dates.get(i - 1), dates.get(i)));
        }

        double medianGap = median(gaps.stream().mapToDouble(Long::doubleValue).toArray());
        Cadence cadence  = matchCadence(medianGap);
        if (cadence == null) return null;

        // Every gap must fit the cadence, not just the median. A merchant billed
        // monthly with one stray mid-month purchase is not a clean subscription,
        // and reporting a next charge date for it would be a guess.
        for (long gap : gaps) {
            if (Math.abs(gap - cadence.days()) > cadence.tolerance()) return null;
        }

        double[] amounts = sorted.stream()
                .mapToDouble(t -> Math.abs(t.getAmount()))
                .toArray();

        double variation = coefficientOfVariation(amounts);
        double limit = dates.size() == 2 ? PAIR_VARIATION_LIMIT : AMOUNT_VARIATION_LIMIT;
        if (variation > limit) return null;

        double typical = median(amounts);
        LocalDate last = dates.get(dates.size() - 1);

        // Project forward past any cycles already missed, so a subscription the
        // user has not opened the app for still shows a future date.
        LocalDate next = last.plusDays(cadence.days());
        while (next.isBefore(today)) {
            next = next.plusDays(cadence.days());
        }

        long daysSinceLast = ChronoUnit.DAYS.between(last, today);
        boolean active = daysSinceLast <= cadence.days() * LAPSED_CYCLE_MULTIPLIER;

        double annualised = typical * (365.0 / cadence.days());

        return new Recurrence(
                merchant,
                cadence.label(),
                cadence.days(),
                round2(typical),
                round2(annualised),
                sorted.size(),
                last,
                next,
                variation > AMOUNT_STEADY_LIMIT,
                active
        );
    }

    /** The cadence whose period the observed gap falls within, or null. */
    static Cadence matchCadence(double gapDays) {
        for (Cadence c : CADENCES) {
            if (Math.abs(gapDays - c.days()) <= c.tolerance()) return c;
        }
        return null;
    }

    // ── Merchant normalization ────────────────────────────────────────────────

    /**
     * Payment rails decorate the same merchant differently on every charge:
     * "NETFLIX*IN 4417", "UPI-NETFLIX COM-8891", "netflix". Grouping on the raw
     * string scatters one subscription across several buckets, each too small to
     * detect. Stripping the decoration collapses them.
     *
     * Deliberately separate from CategoryService.normalizeMerchant, which backs
     * the user's stored category rules — those patterns were saved under that
     * normalization and must keep matching it.
     */
    private static final Set<String> NOISE_TOKENS = new HashSet<>(Arrays.asList(
            "upi", "neft", "imps", "ach", "si", "pos", "ecs", "nach", "bbps",
            "mandate", "autopay", "autodebit", "payment", "paytm", "razorpay",
            "bill", "billdesk", "ref", "refno", "txn", "txnid", "id", "no",
            "com", "in", "ind", "india", "pvt", "ltd", "limited", "private",
            "inc", "llp", "co", "dr", "cr", "to", "from", "the"
    ));

    public static String normalizeMerchant(String merchant) {
        if (merchant == null) return "";

        String cleaned = merchant.toLowerCase()
                // Rails use *, /, -, # and _ as field separators
                .replaceAll("[*/\\-#_|:;,.]+", " ")
                .replaceAll("[^a-z0-9 ]", " ");

        List<String> kept = new ArrayList<>();
        for (String token : cleaned.split("\\s+")) {
            if (token.isEmpty()) continue;
            // Reference numbers and dates: any token carrying a digit
            if (token.matches(".*\\d.*")) continue;
            if (NOISE_TOKENS.contains(token)) continue;
            if (token.length() < 2) continue;
            kept.add(token);
        }

        // Everything was decoration — fall back to a light clean of the original
        // rather than collapsing unrelated merchants into one empty-string group.
        if (kept.isEmpty()) {
            return merchant.toLowerCase().trim().replaceAll("\\s+", " ");
        }

        return String.join(" ", kept);
    }

    // ── Small numeric helpers ─────────────────────────────────────────────────

    /** Median — robust to the one-off outlier a mean would be dragged by. */
    static double median(double[] values) {
        if (values.length == 0) return 0;
        double[] copy = values.clone();
        Arrays.sort(copy);
        int mid = copy.length / 2;
        return copy.length % 2 == 0 ? (copy[mid - 1] + copy[mid]) / 2.0 : copy[mid];
    }

    /** Standard deviation over the mean — scale-free, so ₹99 and ₹9,999 plans compare alike. */
    static double coefficientOfVariation(double[] values) {
        if (values.length < 2) return 0;
        double mean = Arrays.stream(values).average().orElse(0);
        if (mean == 0) return 0;
        double variance = Arrays.stream(values)
                .map(v -> (v - mean) * (v - mean))
                .average().orElse(0);
        return Math.sqrt(variance) / mean;
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
