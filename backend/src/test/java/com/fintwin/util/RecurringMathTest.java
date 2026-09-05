package com.fintwin.util;

import com.fintwin.model.Transaction;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class RecurringMathTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 5);

    // ── Detection ─────────────────────────────────────────────────────────────

    @Test
    void detectsAMonthlySubscription_andProjectsTheNextCharge() {
        List<Transaction> charges = series(-649.0, LocalDate.of(2026, 6, 14), 30, 3);

        RecurringMath.Recurrence r = RecurringMath.detect("netflix", charges, TODAY);

        assertThat(r).isNotNull();
        assertThat(r.cadenceLabel()).isEqualTo("Monthly");
        assertThat(r.typicalAmount()).isEqualTo(649.0);
        assertThat(r.occurrences()).isEqualTo(3);
        assertThat(r.lastCharged()).isEqualTo(LocalDate.of(2026, 8, 13));
        assertThat(r.nextChargeDate()).isEqualTo(LocalDate.of(2026, 9, 12));
        assertThat(r.active()).isTrue();
        assertThat(r.amountVaries()).isFalse();
        // 649 × (365 / 30)
        assertThat(r.annualisedCost()).isEqualTo(7896.17);
    }

    @Test
    void detectsASubscriptionFromOnlyTwoCharges_whichTheOldThresholdMissed() {
        // Started six weeks ago: two charges, two calendar months. The previous
        // "three distinct months" rule could not see this at all.
        List<Transaction> charges = series(-199.0, LocalDate.of(2026, 7, 20), 30, 2);

        RecurringMath.Recurrence r = RecurringMath.detect("spotify", charges, TODAY);

        assertThat(r).isNotNull();
        assertThat(r.cadenceLabel()).isEqualTo("Monthly");
        assertThat(r.occurrences()).isEqualTo(2);
    }

    @Test
    void detectsAnnualAndQuarterlyCharges_invisibleInAThreeMonthWindow() {
        RecurringMath.Recurrence yearly = RecurringMath.detect(
                "amazon prime", series(-1499.0, LocalDate.of(2024, 10, 2), 365, 2), TODAY);
        assertThat(yearly).isNotNull();
        assertThat(yearly.cadenceLabel()).isEqualTo("Yearly");
        assertThat(yearly.annualisedCost()).isEqualTo(1499.0);

        RecurringMath.Recurrence quarterly = RecurringMath.detect(
                "insurance", series(-4500.0, LocalDate.of(2025, 11, 5), 91, 4), TODAY);
        assertThat(quarterly).isNotNull();
        assertThat(quarterly.cadenceLabel()).isEqualTo("Quarterly");
    }

    @Test
    void toleratesBillingDrift_butNotAnIrregularGap() {
        // Real billing dates wobble by a day or two around weekends
        List<Transaction> drifting = List.of(
                txn(-499.0, LocalDate.of(2026, 6, 1)),
                txn(-499.0, LocalDate.of(2026, 7, 3)),
                txn(-499.0, LocalDate.of(2026, 8, 1))
        );
        assertThat(RecurringMath.detect("gym", drifting, TODAY)).isNotNull();

        // A monthly charge with one stray mid-cycle purchase: the gaps no longer
        // agree on any single rhythm, so there is no honest next charge date.
        List<Transaction> irregular = List.of(
                txn(-499.0, LocalDate.of(2026, 6, 1)),
                txn(-499.0, LocalDate.of(2026, 6, 17)),
                txn(-499.0, LocalDate.of(2026, 7, 1)),
                txn(-499.0, LocalDate.of(2026, 8, 1))
        );
        assertThat(RecurringMath.detect("shop", irregular, TODAY)).isNull();
    }

    @Test
    void rejectsIrregularSpendingAtAFrequentMerchant() {
        // Ten grocery runs at varying amounts — repeated, but not a subscription
        List<Transaction> groceries = new ArrayList<>();
        LocalDate d = LocalDate.of(2026, 6, 1);
        double[] amounts = {-1200, -840, -2310, -560, -1980, -720, -3100, -450, -1650, -990};
        for (double amount : amounts) {
            groceries.add(txn(amount, d));
            d = d.plusDays(9);
        }

        assertThat(RecurringMath.detect("dmart", groceries, TODAY)).isNull();
    }

    @Test
    void twoChargesNeedMatchingAmounts_toRuleOutCoincidence() {
        // Two loosely similar charges a month apart at the same shop
        List<Transaction> coincidence = List.of(
                txn(-1200.0, LocalDate.of(2026, 7, 4)),
                txn(-1850.0, LocalDate.of(2026, 8, 3))
        );
        assertThat(RecurringMath.detect("bigbasket", coincidence, TODAY)).isNull();

        // The same pair at a matching amount is evidence enough
        List<Transaction> subscription = List.of(
                txn(-1200.0, LocalDate.of(2026, 7, 4)),
                txn(-1200.0, LocalDate.of(2026, 8, 3))
        );
        assertThat(RecurringMath.detect("bigbasket", subscription, TODAY)).isNotNull();
    }

    @Test
    void allowsAVariableBill_andFlagsIt() {
        // An electricity bill: monthly, but never the same twice
        List<Transaction> bill = List.of(
                txn(-2100.0, LocalDate.of(2026, 6, 8)),
                txn(-2680.0, LocalDate.of(2026, 7, 8)),
                txn(-2340.0, LocalDate.of(2026, 8, 7))
        );

        RecurringMath.Recurrence r = RecurringMath.detect("electricity", bill, TODAY);

        assertThat(r).isNotNull();
        assertThat(r.amountVaries()).isTrue();
        assertThat(r.typicalAmount()).isEqualTo(2340.0);   // median, not mean
    }

    @Test
    void marksALapsedSubscriptionInactive_butStillProjectsForward() {
        // Last charged in March; monthly, so several cycles have been missed
        List<Transaction> cancelled = series(-299.0, LocalDate.of(2026, 1, 10), 30, 3);

        RecurringMath.Recurrence r = RecurringMath.detect("old app", cancelled, TODAY);

        assertThat(r).isNotNull();
        assertThat(r.active()).isFalse();
        assertThat(r.nextChargeDate()).isAfterOrEqualTo(TODAY);
    }

    @Test
    void ignoresSeriesTooShortOrCollapsedOntoOneDay() {
        assertThat(RecurringMath.detect("x", List.of(), TODAY)).isNull();
        assertThat(RecurringMath.detect("x", List.of(txn(-100.0, TODAY)), TODAY)).isNull();

        // A split purchase on one day is not a cycle
        assertThat(RecurringMath.detect("x", List.of(
                txn(-100.0, LocalDate.of(2026, 8, 1)),
                txn(-100.0, LocalDate.of(2026, 8, 1))
        ), TODAY)).isNull();
    }

    // ── detectAll: the shared entry point ─────────────────────────────────────

    @Test
    void detectAllGroupsMerchantSpellingsIntoOneSubscription() {
        // The same subscription as the rails wrote it on three different months.
        // Grouped raw, this is three merchants with one charge each and nothing
        // is detected at all.
        List<Transaction> txns = List.of(
                named("NETFLIX*IN 4417",       -649.0, LocalDate.of(2026, 6, 14)),
                named("UPI-NETFLIX COM-8891",  -649.0, LocalDate.of(2026, 7, 14)),
                named("ACH/NETFLIX INDIA/992", -649.0, LocalDate.of(2026, 8, 13))
        );

        List<RecurringMath.Recurrence> found = RecurringMath.detectAll(txns, TODAY);

        assertThat(found).hasSize(1);
        assertThat(found.get(0).occurrences()).isEqualTo(3);
        assertThat(found.get(0).cadenceLabel()).isEqualTo("Monthly");
        // Named as the bank most recently wrote it, not by the normalized key
        assertThat(found.get(0).merchant()).isEqualTo("ACH/NETFLIX INDIA/992");
    }

    @Test
    void detectAllExcludesCardBillPayments() {
        // A bill payment repeats monthly at a steady amount and is the single
        // largest thing on the statement — exactly the shape of a subscription,
        // and it would head the list if it were not filtered.
        List<Transaction> txns = new ArrayList<>(series(-649.0, LocalDate.of(2026, 6, 14), 30, 3));
        for (Transaction t : series(-45_000.0, LocalDate.of(2026, 6, 28), 30, 3)) {
            t.setMerchant("NEFT DR-CREDIT CARD PAYMENT");
            t.setCategory(TransactionMath.CARD_PAYMENT_CATEGORY);
            txns.add(t);
        }

        List<RecurringMath.Recurrence> found = RecurringMath.detectAll(txns, TODAY);

        assertThat(found).hasSize(1);
        assertThat(found.get(0).merchant()).isEqualTo("m");
    }

    @Test
    void detectAllOrdersByYearlyCost_withLapsedChargesLast() {
        List<Transaction> txns = new ArrayList<>();
        txns.addAll(namedSeries("CHEAP APP",  -99.0,  LocalDate.of(2026, 6, 10), 30, 3));
        txns.addAll(namedSeries("BIG PLAN",   -999.0, LocalDate.of(2026, 6, 12), 30, 3));
        // Lapsed: last charged in February
        txns.addAll(namedSeries("OLD APP",   -5000.0, LocalDate.of(2025, 12, 5), 30, 3));

        List<RecurringMath.Recurrence> found = RecurringMath.detectAll(txns, TODAY);

        assertThat(found).extracting(RecurringMath.Recurrence::merchant)
                .containsExactly("BIG PLAN", "CHEAP APP", "OLD APP");
        assertThat(found.get(2).active()).isFalse();
    }

    @Test
    void detectAllIgnoresIncomeTinyChargesAndAnEmptyHistory() {
        List<Transaction> txns = new ArrayList<>();
        // Salary: a credit, not a charge
        txns.addAll(namedSeries("EMPLOYER", 60_000.0, LocalDate.of(2026, 6, 1), 30, 3));
        // Below the noise floor
        txns.addAll(namedSeries("ROUNDING",     -5.0, LocalDate.of(2026, 6, 2), 30, 3));

        assertThat(RecurringMath.detectAll(txns, TODAY)).isEmpty();
        assertThat(RecurringMath.detectAll(List.of(), TODAY)).isEmpty();
        assertThat(RecurringMath.detectAll(null, TODAY)).isEmpty();
    }

    @Test
    void detectAllIgnoresChargesOlderThanTheWindow() {
        // Two years back: outside the 13-month window even though it is regular
        List<Transaction> ancient = namedSeries("OLD SUB", -299.0, LocalDate.of(2024, 1, 5), 30, 4);

        assertThat(RecurringMath.detectAll(ancient, TODAY)).isEmpty();
    }

    // ── Merchant normalization ────────────────────────────────────────────────

    @Test
    void normalizationCollapsesRailDecoration_soOneSubscriptionStaysOneGroup() {
        String expected = "netflix";
        assertThat(RecurringMath.normalizeMerchant("NETFLIX*IN 4417")).isEqualTo(expected);
        assertThat(RecurringMath.normalizeMerchant("UPI-NETFLIX COM-8891")).isEqualTo(expected);
        assertThat(RecurringMath.normalizeMerchant("netflix")).isEqualTo(expected);
        assertThat(RecurringMath.normalizeMerchant("ACH/NETFLIX INDIA PVT LTD/889231")).isEqualTo(expected);
    }

    @Test
    void normalizationKeepsDistinctMerchantsApart() {
        assertThat(RecurringMath.normalizeMerchant("AMAZON PRIME"))
                .isNotEqualTo(RecurringMath.normalizeMerchant("AMAZON PAY"));
        assertThat(RecurringMath.normalizeMerchant("UPI-SWIGGY-123"))
                .isNotEqualTo(RecurringMath.normalizeMerchant("UPI-ZOMATO-123"));
    }

    @Test
    void normalizationFallsBackWhenEverythingLooksLikeDecoration() {
        // All-numeric narration: strip everything and unrelated merchants would
        // collapse into one empty group, so the original is kept instead.
        assertThat(RecurringMath.normalizeMerchant("8891 4417")).isEqualTo("8891 4417");
        assertThat(RecurringMath.normalizeMerchant(null)).isEmpty();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static List<Transaction> series(double amount, LocalDate start, int gapDays, int count) {
        List<Transaction> out = new ArrayList<>();
        LocalDate d = start;
        for (int i = 0; i < count; i++) {
            out.add(txn(amount, d));
            d = d.plusDays(gapDays);
        }
        return out;
    }

    private static List<Transaction> namedSeries(String merchant, double amount,
                                                LocalDate start, int gapDays, int count) {
        List<Transaction> out = series(amount, start, gapDays, count);
        out.forEach(t -> t.setMerchant(merchant));
        return out;
    }

    private static Transaction named(String merchant, double amount, LocalDate date) {
        Transaction t = txn(amount, date);
        t.setMerchant(merchant);
        return t;
    }

    private static Transaction txn(Double amount, LocalDate date) {
        Transaction t = new Transaction();
        t.setAmount(amount);
        t.setDate(date);
        t.setMerchant("m");
        return t;
    }
}
