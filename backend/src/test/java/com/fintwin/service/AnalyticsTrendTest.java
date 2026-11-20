package com.fintwin.service;

import com.fintwin.dto.MonthlySummaryDTO;
import com.fintwin.model.Transaction;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AnalyticsTrendTest {

    @Test
    void a_rise_from_a_negative_month_shows_as_a_rise() {
        // last month's savings were negative; this month they're positive
        assertThat(AnalyticsService.calculateTrend(13804, -6550)).isEqualTo(310.7);
    }

    @Test
    void ordinary_changes_keep_their_sign() {
        assertThat(AnalyticsService.calculateTrend(110, 100)).isEqualTo(10.0);
        assertThat(AnalyticsService.calculateTrend(90, 100)).isEqualTo(-10.0);
        assertThat(AnalyticsService.calculateTrend(-200, -100)).isEqualTo(-100.0);   // savings fell further
    }

    @Test
    void no_last_month_means_no_change_shown() {
        assertThat(AnalyticsService.calculateTrend(500, 0)).isEqualTo(0.0);
    }

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 20);

    private static Transaction tx(String date, double amount, String category) {
        Transaction t = new Transaction();
        t.setDate(LocalDate.parse(date));
        t.setAmount(amount);
        t.setCategory(category);
        t.setMerchant("Someone");
        return t;
    }

    @Test
    void the_comparison_is_the_same_days_of_last_month() {
        assertThat(AnalyticsService.sameDayLastMonth(TODAY)).isEqualTo(LocalDate.of(2026, 10, 20));
        assertThat(AnalyticsService.sameDayLastMonth(LocalDate.of(2026, 11, 1))).isEqualTo(LocalDate.of(2026, 10, 1));
        // a longer month than the one before it compares with all of the shorter one
        assertThat(AnalyticsService.sameDayLastMonth(LocalDate.of(2027, 3, 31))).isEqualTo(LocalDate.of(2027, 2, 28));
        assertThat(AnalyticsService.sameDayLastMonth(LocalDate.of(2027, 1, 15))).isEqualTo(LocalDate.of(2026, 12, 15));
    }

    @Test
    void this_month_is_measured_against_the_same_days_of_last_month_not_all_of_it() {
        MonthlySummaryDTO d = AnalyticsService.summarize(List.of(
                tx("2026-10-05", 10_000, "Salary"),
                tx("2026-10-10", -4_000, "Food"),
                tx("2026-10-25", -30_000, "Shopping"),   // after 20 Oct: not in the comparison
                tx("2026-11-03", 12_000, "Salary"),
                tx("2026-11-12", -3_000, "Food")), TODAY);

        assertThat(d.getMonthFrom()).isEqualTo(LocalDate.of(2026, 11, 1));
        assertThat(d.getMonthIncome()).isEqualTo(12_000);
        assertThat(d.getMonthExpenses()).isEqualTo(3_000);
        assertThat(d.getMonthSavings()).isEqualTo(9_000);

        assertThat(d.getComparedFrom()).isEqualTo(LocalDate.of(2026, 10, 1));
        assertThat(d.getComparedTo()).isEqualTo(LocalDate.of(2026, 10, 20));
        assertThat(d.getComparedIncome()).isEqualTo(10_000);
        assertThat(d.getComparedExpenses()).isEqualTo(4_000);
        assertThat(d.getComparedSavings()).isEqualTo(6_000);

        assertThat(d.getIncomeTrend()).isEqualTo(20.0);
        assertThat(d.getExpenseTrend()).isEqualTo(-25.0);
        assertThat(d.getSavingsTrend()).isEqualTo(50.0);
    }

    @Test
    void all_time_covers_everything_and_the_three_months_start_two_months_back() {
        MonthlySummaryDTO d = AnalyticsService.summarize(List.of(
                tx("2026-06-24", 50_000, "Salary"),
                tx("2026-07-02", -20_000, "Rent"),
                tx("2026-09-01", 8_000, "Salary"),
                tx("2026-10-08", -22_184, "People"),
                tx("2026-11-12", -1_000, "Food")), TODAY);

        assertThat(d.getPeriodFrom()).isEqualTo(LocalDate.of(2026, 9, 1));
        assertThat(d.getIncome()).isEqualTo(8_000);
        assertThat(d.getExpenses()).isEqualTo(23_184);
        assertThat(d.getSavings()).isEqualTo(-15_184);
        assertThat(d.getTransactionCount()).isEqualTo(3);

        assertThat(d.getAllTimeFrom()).isEqualTo(LocalDate.of(2026, 6, 24));
        assertThat(d.getAllTimeIncome()).isEqualTo(58_000);
        assertThat(d.getAllTimeExpenses()).isEqualTo(43_184);
        assertThat(d.getAllTimeSavings()).isEqualTo(14_816);
    }

    @Test
    void transfers_between_own_accounts_count_in_no_period() {
        MonthlySummaryDTO d = AnalyticsService.summarize(List.of(
                tx("2026-10-10", -5_000, "Transfer"),
                tx("2026-11-10", 5_000, "Transfer"),
                tx("2026-11-11", -500, "Food")), TODAY);

        assertThat(d.getMonthIncome()).isZero();
        assertThat(d.getMonthExpenses()).isEqualTo(500);
        assertThat(d.getComparedExpenses()).isZero();
        assertThat(d.getAllTimeSavings()).isEqualTo(-500);
    }

    @Test
    void no_transactions_gives_zeros_and_no_start_date() {
        MonthlySummaryDTO d = AnalyticsService.summarize(List.of(), TODAY);
        assertThat(d.getAllTimeFrom()).isNull();
        assertThat(d.getAllTimeSavings()).isZero();
        assertThat(d.getSavingsTrend()).isZero();
    }
}
