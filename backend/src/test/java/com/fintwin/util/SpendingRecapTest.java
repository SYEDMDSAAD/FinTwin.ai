package com.fintwin.util;

import com.fintwin.model.Transaction;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SpendingRecapTest {

    // Saturday 5 Sep 2026, 9am
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 9, 5, 9, 0);

    // ── Headline ──────────────────────────────────────────────────────────────

    @Test
    void leadsWithWhatWasSpentAndOverWhatStretch() {
        List<Transaction> window = List.of(
                txn(-1200.0, "SWIGGY",  "Food",     LocalDate.of(2026, 9, 4)),
                txn(-340.0,  "UBER",    "Transport",LocalDate.of(2026, 9, 4))
        );

        SpendingRecap.Recap recap = SpendingRecap.build(
                window, List.of(), List.of(), NOW.minusDays(2), NOW);

        assertThat(recap.headline()).isEqualTo("You spent ₹1,540 since Thursday.");
        assertThat(recap.totalSpent()).isEqualTo(1540.0);
        assertThat(recap.chargeCount()).isEqualTo(2);
        assertThat(recap.firstVisit()).isFalse();
    }

    @Test
    void saysNothingHappenedRatherThanShowingAZero() {
        SpendingRecap.Recap recap = SpendingRecap.build(
                List.of(), List.of(), List.of(), NOW.minusDays(1), NOW);

        assertThat(recap.headline()).isEqualTo("Nothing new since yesterday.");
        assertThat(recap.lines()).containsExactly(
                "No new charges have come in since you last checked.");
    }

    @Test
    void countsSpendingOnly_notCreditsOrMoneyMovedBetweenOwnAccounts() {
        List<Transaction> window = List.of(
                txn(-1000.0,  "SWIGGY",           "Food",         LocalDate.of(2026, 9, 4)),
                txn(60_000.0, "EMPLOYER",         "Income",       LocalDate.of(2026, 9, 3)),
                txn(-20_000.0,"SELF TRANSFER",    null,           LocalDate.of(2026, 9, 3)),
                txn(-45_000.0,"CC PAYMENT",       "Card Payment", LocalDate.of(2026, 9, 2))
        );

        SpendingRecap.Recap recap = SpendingRecap.build(
                window, List.of(), List.of(), NOW.minusDays(3), NOW);

        assertThat(recap.totalSpent()).isEqualTo(1000.0);
        assertThat(recap.chargeCount()).isEqualTo(1);
    }

    // ── Period labels ─────────────────────────────────────────────────────────

    @Test
    void namesTheStretchTheWayAPersonWould() {
        assertThat(SpendingRecap.periodLabel(NOW.minusHours(3), NOW)).isEqualTo("today");
        assertThat(SpendingRecap.periodLabel(NOW.minusDays(1),  NOW)).isEqualTo("since yesterday");
        assertThat(SpendingRecap.periodLabel(NOW.minusDays(3),  NOW)).isEqualTo("since Wednesday");
        assertThat(SpendingRecap.periodLabel(NOW.minusDays(9),  NOW)).isEqualTo("in the last week");
        assertThat(SpendingRecap.periodLabel(NOW.minusDays(20), NOW)).isEqualTo("in the last few weeks");
        assertThat(SpendingRecap.periodLabel(NOW.minusDays(60), NOW)).isEqualTo("since July");
        assertThat(SpendingRecap.periodLabel(null, NOW)).isEqualTo("in the last 30 days");
    }

    // ── Supporting lines ──────────────────────────────────────────────────────

    @Test
    void callsOutADominantCategoryDifferentlyToAMerelyLargestOne() {
        List<Transaction> dominant = List.of(
                txn(-4000.0, "SWIGGY", "Food",      LocalDate.of(2026, 9, 4)),
                txn(-500.0,  "UBER",   "Transport", LocalDate.of(2026, 9, 4))
        );
        assertThat(SpendingRecap.build(dominant, List.of(), List.of(), NOW.minusDays(2), NOW).lines())
                .anyMatch(l -> l.startsWith("Most of it — ₹4,000 — went on food."));

        List<Transaction> spread = List.of(
                txn(-1000.0, "SWIGGY",  "Food",          LocalDate.of(2026, 9, 4)),
                txn(-900.0,  "UBER",    "Transport",     LocalDate.of(2026, 9, 4)),
                txn(-900.0,  "AMAZON",  "Shopping",      LocalDate.of(2026, 9, 4)),
                txn(-800.0,  "NETFLIX", "Entertainment", LocalDate.of(2026, 9, 3))
        );
        assertThat(SpendingRecap.build(spread, List.of(), List.of(), NOW.minusDays(2), NOW).lines())
                .anyMatch(l -> l.equals("Your biggest category was food at ₹1,000."));
    }

    @Test
    void namesTheLargestCharge_onlyWhenTheListIsLongEnoughToNeedIt() {
        List<Transaction> three = List.of(
                txn(-2400.0, "UPI-BIGBASKET-8891", "Groceries", LocalDate.of(2026, 9, 3)),
                txn(-300.0,  "UBER",               "Transport", LocalDate.of(2026, 9, 4)),
                txn(-250.0,  "SWIGGY",             "Food",      LocalDate.of(2026, 9, 4))
        );
        assertThat(SpendingRecap.build(three, List.of(), List.of(), NOW.minusDays(3), NOW).lines())
                // Merchant cleaned up for reading, and the day named
                .anyMatch(l -> l.equals(
                        "The largest single charge was ₹2,400 at Bigbasket on Thursday."));

        // With two charges the largest is already on screen; repeating it is noise
        List<Transaction> two = List.of(
                txn(-2400.0, "BIGBASKET", "Groceries", LocalDate.of(2026, 9, 3)),
                txn(-250.0,  "SWIGGY",    "Food",      LocalDate.of(2026, 9, 4))
        );
        assertThat(SpendingRecap.build(two, List.of(), List.of(), NOW.minusDays(3), NOW).lines())
                .noneMatch(l -> l.startsWith("The largest single charge"));
    }

    @Test
    void comparesPaceAgainstTheUsual_andStaysQuietWhenTheGapIsNoise() {
        // Baseline: ₹500/day across 40 days
        List<Transaction> baseline = dailySeries(-500.0, LocalDate.of(2026, 7, 20), 40);

        // Window: ₹1,000/day over two days — double the usual
        List<Transaction> heavy = List.of(
                txn(-1000.0, "SWIGGY", "Food", LocalDate.of(2026, 9, 4)),
                txn(-1000.0, "AMAZON", "Shopping", LocalDate.of(2026, 9, 4))
        );
        assertThat(SpendingRecap.build(heavy, baseline, List.of(), NOW.minusDays(2), NOW).lines())
                .anyMatch(l -> l.contains("a day, about") && l.contains("above your usual"));

        // Window at roughly the usual rate says so plainly instead of inventing a delta
        List<Transaction> normal = List.of(
                txn(-520.0, "SWIGGY", "Food",      LocalDate.of(2026, 9, 4)),
                txn(-500.0, "UBER",   "Transport", LocalDate.of(2026, 9, 3))
        );
        assertThat(SpendingRecap.build(normal, baseline, List.of(), NOW.minusDays(2), NOW).lines())
                .anyMatch(l -> l.contains("roughly your usual pace"));
    }

    @Test
    void skipsThePaceLineWhenThereIsTooLittleHistoryToJudge() {
        List<Transaction> thinBaseline = List.of(
                txn(-500.0, "SWIGGY", "Food", LocalDate.of(2026, 9, 1))
        );
        List<Transaction> window = List.of(
                txn(-1000.0, "AMAZON", "Shopping", LocalDate.of(2026, 9, 4))
        );

        assertThat(SpendingRecap.build(window, thinBaseline, List.of(), NOW.minusDays(2), NOW).lines())
                .noneMatch(l -> l.contains("a day"));
    }

    // ── Upcoming charges ──────────────────────────────────────────────────────

    @Test
    void warnsAboutARecurringChargeLandingThisWeek() {
        List<RecurringMath.Recurrence> upcoming = List.of(
                recurrence("NETFLIX*IN 4417", 649.0, LocalDate.of(2026, 9, 8), true),
                recurrence("SPOTIFY", 199.0, LocalDate.of(2026, 10, 20), true)  // too far out
        );

        assertThat(SpendingRecap.build(List.of(), List.of(), upcoming, NOW.minusDays(1), NOW).lines())
                .contains("Coming up: ₹649 to Netflix in 3 days.");
    }

    @Test
    void summarisesSeveralUpcomingChargesRatherThanListingEach() {
        List<RecurringMath.Recurrence> upcoming = List.of(
                recurrence("NETFLIX", 649.0, LocalDate.of(2026, 9, 6), true),
                recurrence("SPOTIFY", 199.0, LocalDate.of(2026, 9, 8), true),
                recurrence("GYM",    1500.0, LocalDate.of(2026, 9, 10), true)
        );

        assertThat(SpendingRecap.build(List.of(), List.of(), upcoming, NOW.minusDays(1), NOW).lines())
                .contains("Coming up: 3 recurring charges worth ₹2,348 in the next week, "
                          + "starting with Netflix tomorrow.");
    }

    @Test
    void ignoresLapsedSubscriptionsInTheUpcomingLine() {
        List<RecurringMath.Recurrence> upcoming = List.of(
                recurrence("OLD APP", 299.0, LocalDate.of(2026, 9, 7), false)
        );

        assertThat(SpendingRecap.build(List.of(), List.of(), upcoming, NOW.minusDays(1), NOW).lines())
                .noneMatch(l -> l.startsWith("Coming up"));
    }

    // ── Formatting ────────────────────────────────────────────────────────────

    @Test
    void formatsMoneyWithIndianGroupingAndNoPaise() {
        assertThat(SpendingRecap.money(1540.0)).isEqualTo("₹1,540");
        assertThat(SpendingRecap.money(123456.78)).isEqualTo("₹1,23,457");
        assertThat(SpendingRecap.money(0)).isEqualTo("₹0");
    }

    @Test
    void makesARailDecoratedMerchantReadableInASentence() {
        assertThat(SpendingRecap.cleanMerchant("UPI-SWIGGY-8891")).isEqualTo("Swiggy");
        assertThat(SpendingRecap.cleanMerchant("NETFLIX*IN 4417")).isEqualTo("Netflix");
        assertThat(SpendingRecap.cleanMerchant("AMAZON PRIME")).isEqualTo("Amazon Prime");
        assertThat(SpendingRecap.cleanMerchant(null)).isEqualTo("an unnamed merchant");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static List<Transaction> dailySeries(double amount, LocalDate start, int days) {
        List<Transaction> out = new ArrayList<>();
        LocalDate d = start;
        for (int i = 0; i < days; i++) {
            out.add(txn(amount, "SHOP", "Other", d));
            d = d.plusDays(1);
        }
        return out;
    }

    private static RecurringMath.Recurrence recurrence(String merchant, double amount,
                                                       LocalDate next, boolean active) {
        return new RecurringMath.Recurrence(
                merchant, "Monthly", 30, amount, amount * 12, 4,
                next.minusDays(30), next, false, active);
    }

    private static Transaction txn(Double amount, String merchant, String category, LocalDate date) {
        Transaction t = new Transaction();
        t.setAmount(amount);
        t.setMerchant(merchant);
        t.setCategory(category);
        t.setDate(date);
        return t;
    }

    @Test
    void paymentsToPeopleReadAsSuch() {
        assertThat(SpendingRecap.categoryPhrase("People")).isEqualTo("payments to people");
        assertThat(SpendingRecap.categoryPhrase("Food")).isEqualTo("food");
    }
}

