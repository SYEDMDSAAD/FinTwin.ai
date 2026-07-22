package com.fintwin.util;

import com.fintwin.model.FinancialGoal;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class GoalMathTest {

    private static final YearMonth NOW = YearMonth.of(2026, 7);

    @Test
    void singleGoal_receivesEachMonthsMeasuredSavings() {
        FinancialGoal goal = goal(1L, 120_000.0, 10_000.0, LocalDate.of(2026, 5, 15), null);

        Map<Long, Double> allocated = GoalMath.allocateSavings(
                List.of(goal),
                Map.of(YearMonth.of(2026, 5), 12_000.0,
                       YearMonth.of(2026, 6), 8_000.0,
                       YearMonth.of(2026, 7), 15_000.0),
                NOW);

        // Measured, not extrapolated: 12k + 8k + 15k, each month at its own rate
        assertThat(allocated.get(1L)).isEqualTo(35_000.0, within(0.01));
    }

    @Test
    void aBadCurrentMonth_doesNotRewritePastProgress() {
        FinancialGoal goal = goal(1L, 120_000.0, 10_000.0, LocalDate.of(2026, 5, 15), null);

        Map<Long, Double> allocated = GoalMath.allocateSavings(
                List.of(goal),
                Map.of(YearMonth.of(2026, 5), 12_000.0,
                       YearMonth.of(2026, 6), 12_000.0,
                       YearMonth.of(2026, 7), -40_000.0),
                NOW);

        // The overspent month adds nothing but takes nothing back
        assertThat(allocated.get(1L)).isEqualTo(24_000.0, within(0.01));
    }

    @Test
    void twoGoals_splitTheMonthProportionallyToMonthlyTarget_notEachInFull() {
        FinancialGoal a = goal(1L, 120_000.0, 10_000.0, LocalDate.of(2026, 7, 1), null);
        FinancialGoal b = goal(2L, 60_000.0,   5_000.0, LocalDate.of(2026, 7, 1), null);

        Map<Long, Double> allocated = GoalMath.allocateSavings(
                List.of(a, b),
                Map.of(YearMonth.of(2026, 7), 18_000.0),
                NOW);

        assertThat(allocated.get(1L)).isEqualTo(12_000.0, within(0.01));
        assertThat(allocated.get(2L)).isEqualTo(6_000.0, within(0.01));
        // The same rupee never lands on two goals
        assertThat(allocated.get(1L) + allocated.get(2L)).isEqualTo(18_000.0, within(0.01));
    }

    @Test
    void monthsBeforeAGoalExisted_doNotCountTowardIt() {
        FinancialGoal old = goal(1L, 100_000.0, 10_000.0, LocalDate.of(2026, 5, 1), null);
        FinancialGoal young = goal(2L, 100_000.0, 10_000.0, LocalDate.of(2026, 7, 1), null);

        Map<Long, Double> allocated = GoalMath.allocateSavings(
                List.of(old, young),
                Map.of(YearMonth.of(2026, 5), 10_000.0,
                       YearMonth.of(2026, 6), 10_000.0,
                       YearMonth.of(2026, 7), 10_000.0),
                NOW);

        assertThat(allocated.get(1L)).isEqualTo(25_000.0, within(0.01));
        assertThat(allocated.get(2L)).isEqualTo(5_000.0, within(0.01));
    }

    @Test
    void aFullGoal_overflowsItsShareToTheGoalsStillShort() {
        FinancialGoal small = goal(1L, 4_000.0, 10_000.0, LocalDate.of(2026, 7, 1), null);
        FinancialGoal big = goal(2L, 200_000.0, 10_000.0, LocalDate.of(2026, 7, 1), null);

        Map<Long, Double> allocated = GoalMath.allocateSavings(
                List.of(small, big),
                Map.of(YearMonth.of(2026, 7), 20_000.0),
                NOW);

        // small caps at its 4k target; the 6k excess water-fills into big
        assertThat(allocated.get(1L)).isEqualTo(4_000.0, within(0.01));
        assertThat(allocated.get(2L)).isEqualTo(16_000.0, within(0.01));
    }

    @Test
    void savingsBeyondEveryTarget_stayUnallocated() {
        FinancialGoal goal = goal(1L, 5_000.0, 5_000.0, LocalDate.of(2026, 7, 1), null);

        Map<Long, Double> allocated = GoalMath.allocateSavings(
                List.of(goal),
                Map.of(YearMonth.of(2026, 7), 50_000.0),
                NOW);

        assertThat(allocated.get(1L)).isEqualTo(5_000.0, within(0.01));
    }

    @Test
    void aCompletedGoal_stopsAccruingAfterItsCompletionMonth() {
        FinancialGoal done = goal(1L, 100_000.0, 10_000.0,
                LocalDate.of(2026, 5, 1), LocalDate.of(2026, 6, 20));
        FinancialGoal open = goal(2L, 100_000.0, 10_000.0, LocalDate.of(2026, 5, 1), null);

        Map<Long, Double> allocated = GoalMath.allocateSavings(
                List.of(done, open),
                Map.of(YearMonth.of(2026, 6), 10_000.0,
                       YearMonth.of(2026, 7), 10_000.0),
                NOW);

        // June splits between both; July belongs to the open goal alone
        assertThat(allocated.get(1L)).isEqualTo(5_000.0, within(0.01));
        assertThat(allocated.get(2L)).isEqualTo(15_000.0, within(0.01));
    }

    @Test
    void nullCreatedAt_accruesOnlyTheCurrentMonth() {
        FinancialGoal legacy = goal(1L, 100_000.0, 10_000.0, null, null);

        Map<Long, Double> allocated = GoalMath.allocateSavings(
                List.of(legacy),
                Map.of(YearMonth.of(2026, 6), 99_000.0,
                       YearMonth.of(2026, 7), 7_000.0),
                NOW);

        assertThat(allocated.get(1L)).isEqualTo(7_000.0, within(0.01));
    }

    @Test
    void noGoals_orNoSavings_allocateNothing() {
        assertThat(GoalMath.allocateSavings(List.of(), Map.of(), NOW)).isEmpty();

        FinancialGoal goal = goal(1L, 100_000.0, 10_000.0, LocalDate.of(2026, 5, 1), null);
        Map<Long, Double> allocated =
                GoalMath.allocateSavings(List.of(goal), Map.of(), NOW);
        assertThat(allocated.get(1L)).isZero();
    }

    @Test
    void zeroMonthlyTarget_takesNothing_andDoesNotStallTheMonth() {
        FinancialGoal weightless = goal(1L, 100_000.0, 0.0, LocalDate.of(2026, 7, 1), null);
        FinancialGoal normal = goal(2L, 100_000.0, 10_000.0, LocalDate.of(2026, 7, 1), null);

        Map<Long, Double> allocated = GoalMath.allocateSavings(
                List.of(weightless, normal),
                Map.of(YearMonth.of(2026, 7), 10_000.0),
                NOW);

        assertThat(allocated.get(1L)).isZero();
        assertThat(allocated.get(2L)).isEqualTo(10_000.0, within(0.01));
    }

    private static FinancialGoal goal(Long id, Double target, Double monthlyTarget,
                                      LocalDate createdAt, LocalDate completedAt) {
        FinancialGoal g = new FinancialGoal();
        g.setId(id);
        g.setTargetAmount(target);
        g.setMonthlyTarget(monthlyTarget);
        g.setCreatedAt(createdAt);
        g.setCompletedAt(completedAt);
        if (completedAt != null) g.setCompleted(true);
        return g;
    }
}
