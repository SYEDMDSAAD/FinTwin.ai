package com.fintwin.util;

import com.fintwin.model.FinancialGoal;
import com.fintwin.model.Investment;
import com.fintwin.model.SipPlan;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class InvestmentPlanTest {

    static final LocalDate TODAY = LocalDate.of(2026, 11, 27);

    static FinancialGoal goal(long id, String title, double target, Double expected, int months, LocalDate created) {
        FinancialGoal g = new FinancialGoal();
        g.setId(id);
        g.setTitle(title);
        g.setTargetAmount(target);
        g.setExpectedSaved(expected);
        g.setDurationMonths(months);
        g.setCreatedAt(created);
        return g;
    }

    static Investment holding(String type, Double current, Double invested) {
        Investment i = new Investment();
        i.setType(type);
        i.setCurrentValue(current);
        i.setInvestedAmount(invested);
        return i;
    }

    @Test
    void addsUpTheUsersOwnNumbersWithoutSuggestingAMix() {
        FinancialGoal goa = goal(1, "Goa Trip", 60_000, 20_000.0, 12, LocalDate.of(2026, 3, 1)); // due Mar 2027: 4 months
        FinancialGoal done = goal(2, "Phone", 30_000, 30_000.0, 6, LocalDate.of(2026, 1, 1));
        done.setCompleted(true);
        SipPlan monthly = new SipPlan(); monthly.setAmount(new BigDecimal("5000")); monthly.setFrequency("Monthly");
        SipPlan quarterly = new SipPlan(); quarterly.setAmount(new BigDecimal("3000")); quarterly.setFrequency("Quarterly");

        InvestmentPlan.Result r = InvestmentPlan.build(80_000, 55_000, 110_000,
                List.of(goa, done),
                List.of(holding("Mutual Fund", 75_000.0, 60_000.0), holding("Stock", null, 25_000.0), holding("FD", 0.0, null)),
                List.of(monthly, quarterly), TODAY);

        assertThat(r.monthlySurplus()).isEqualTo(25_000);
        assertThat(r.emergency().monthsCovered()).isEqualTo(2.0);
        assertThat(r.emergency().shortfall()).isEqualTo(6 * 55_000 - 110_000);
        assertThat(r.goals()).singleElement().satisfies(g -> {
            assertThat(g.title()).isEqualTo("Goa Trip");
            assertThat(g.monthsLeft()).isEqualTo(4);
            assertThat(g.monthlyNeeded()).isEqualTo(10_000);
        });
        assertThat(r.leftAfterGoals()).isEqualTo(15_000);
        assertThat(r.sipMonthly()).isEqualTo(6_000);
        assertThat(r.portfolioValue()).isEqualTo(100_000);
        assertThat(r.mix()).extracting(InvestmentPlan.Slice::type).containsExactly("Mutual Fund", "Stock");
        assertThat(r.mix().get(0).percent()).isEqualTo(75.0);
    }

    @Test
    void overdueGoalNeedsTheRestNowAndNoSpendingMeansNoEmergencyMaths() {
        FinancialGoal late = goal(1, "Laptop", 50_000, 10_000.0, 3, LocalDate.of(2026, 1, 1));
        InvestmentPlan.Result r = InvestmentPlan.build(0, 0, -500, List.of(late), List.of(), List.of(), TODAY);
        assertThat(r.goals().get(0).monthsLeft()).isEqualTo(1);
        assertThat(r.goals().get(0).monthlyNeeded()).isEqualTo(40_000);
        assertThat(r.emergency().saved()).isZero();
        assertThat(r.emergency().shortfall()).isZero();
        assertThat(r.mix()).isEmpty();
    }
}
