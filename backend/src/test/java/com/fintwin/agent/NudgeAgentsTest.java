package com.fintwin.agent;

import com.fintwin.dto.NotificationDTO;
import com.fintwin.model.FinancialGoal;
import com.fintwin.model.Transaction;
import com.fintwin.service.ReportService;
import com.fintwin.util.PlanDraftMath;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class NudgeAgentsTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 27);

    private static PlanDraftMath.BudgetLine line(String cat, double typical, double suggested, Double limit) {
        return new PlanDraftMath.BudgetLine(cat, typical, suggested, false, limit, "");
    }

    private static PlanDraftMath.Draft draft(List<PlanDraftMath.BudgetLine> lines, int months) {
        return new PlanDraftMath.Draft(null, lines, months, 30000, null, TODAY);
    }

    private static Transaction charge(String merchant, double amount, LocalDate date) {
        Transaction t = new Transaction();
        t.setAmount(-amount);
        t.setDate(date);
        t.setMerchant(merchant);
        return t;
    }

    // ── Budget agent ────────────────────────────────────────────────────────

    @Test
    void withNoBudgetsItPointsAtTheDraft() {
        List<NotificationDTO> n = NudgeAgents.budgetNudges(draft(List.of(
                line("Food", 8000, 7500, null), line("Transport", 3000, 3000, null)), 3), false);
        assertThat(n).singleElement().extracting(NotificationDTO::getMessage).asString()
                .startsWith("FinTwin drafted 2 budgets from your last 3 months of spending (₹10,500 a month in all)");
    }

    @Test
    void withBudgetsItFlagsOnlyALimitWellBelowRealSpending() {
        List<NotificationDTO> n = NudgeAgents.budgetNudges(draft(List.of(
                line("Food", 9000, 8500, 6000.0),        // ₹3,000 under: flagged
                line("Transport", 3100, 3000, 3000.0),   // close enough
                line("Shopping", 2400, 2000, 2000.0)),   // 20% over but only ₹400
                3), true);
        assertThat(n).singleElement().extracting(NotificationDTO::getMessage).asString()
                .startsWith("Your Food budget of ₹6,000 is below what you usually spend (₹9,000 a month)");
        assertThat(NudgeAgents.budgetNudges(draft(List.of(line("Food", 8000, 7500, null)), 0), false)).isEmpty();
    }

    // ── Subscription agent ──────────────────────────────────────────────────

    @Test
    void remindsOfARenewalInTheNextThreeDays() {
        List<Transaction> year = new ArrayList<>();
        for (int i = 5; i >= 1; i--) year.add(charge("NETFLIX", 649, TODAY.plusDays(2).minusMonths(i)));
        List<NotificationDTO> n = NudgeAgents.subscriptionNudges(year, TODAY);
        assertThat(n).extracting(NotificationDTO::getMessage)
                .anyMatch(m -> m.matches("NETFLIX renews (today|tomorrow|in [23] days): about ₹649\\. .*"));
    }

    @Test
    void spotsAPriceRiseOnTheLatestCharge() {
        List<Transaction> year = new ArrayList<>();
        for (int i = 5; i >= 1; i--) year.add(charge("SPOTIFY", 119, TODAY.minusDays(3).minusMonths(i)));
        year.add(charge("SPOTIFY", 139, TODAY.minusDays(3)));
        List<NotificationDTO> n = NudgeAgents.subscriptionNudges(year, TODAY);
        assertThat(n).extracting(NotificationDTO::getMessage)
                .anyMatch(m -> m.startsWith("SPOTIFY went up from ₹119 to ₹139: about ₹243 more a year"));
    }

    @Test
    void aSteadySubscriptionAwayFromRenewalSaysNothing() {
        List<Transaction> year = new ArrayList<>();
        for (int i = 5; i >= 0; i--) year.add(charge("HOTSTAR", 299, TODAY.minusDays(10).minusMonths(i)));
        assertThat(NudgeAgents.subscriptionNudges(year, TODAY)).isEmpty();
    }

    // ── Goal agent ──────────────────────────────────────────────────────────

    private static FinancialGoal goal(String title, String health, double target, double saved, LocalDate created, int months) {
        FinancialGoal g = new FinancialGoal();
        g.setTitle(title);
        g.setGoalHealth(health);
        g.setTargetAmount(target);
        g.setExpectedSaved(saved);
        g.setCreatedAt(created);
        g.setDurationMonths(months);
        g.setCompleted(false);
        return g;
    }

    private static PlanDraftMath.Salary salaryOn(LocalDate paid, double amount) {
        return new PlanDraftMath.Salary("ACME", amount, paid.getDayOfMonth(), 3, paid, amount, paid.plusMonths(1));
    }

    @Test
    void onSalaryDayItNamesWhatToSetAsideForTheGoalDueFirst() {
        List<FinancialGoal> goals = List.of(
                goal("Car", "At Risk", 300_000, 50_000, TODAY.minusMonths(6), 24),
                goal("Goa trip", "Critical", 40_000, 10_000, TODAY.minusMonths(2), 5),   // due Feb 2027
                goal("Phone", "On Track", 60_000, 30_000, TODAY.minusMonths(3), 6));
        NotificationDTO n = NudgeAgents.goalNudge(goals, salaryOn(TODAY.minusDays(1), 80_000), TODAY);
        // ₹30,000 left over ~3 months = ₹10,000 a month
        assertThat(n.getMessage()).isEqualTo("From this salary, ₹10,000 towards 'Goa trip' would get it back on track"
                + " for Feb 2027. Set it aside in Spend Guard → Salary day.");
    }

    @Test
    void neverAsksForMoreThanAShareOfTheSalaryAndOnlyOnSalaryDay() {
        List<FinancialGoal> goals = List.of(goal("House", "Critical", 2_000_000, 0, TODAY.minusMonths(1), 4));
        NotificationDTO n = NudgeAgents.goalNudge(goals, salaryOn(TODAY, 50_000), TODAY);
        assertThat(n.getMessage()).startsWith("From this salary, ₹15,000 towards 'House'");
        assertThat(NudgeAgents.goalNudge(goals, salaryOn(TODAY.minusDays(10), 50_000), TODAY)).isNull();
        assertThat(NudgeAgents.goalNudge(goals, null, TODAY)).isNull();
    }

    // ── Weekly agent ────────────────────────────────────────────────────────

    @Test
    void aWeekStartsOnMonday() {
        assertThat(ReportService.weekStart(LocalDate.of(2026, 11, 27))).isEqualTo(LocalDate.of(2026, 11, 23));
        assertThat(ReportService.weekStart(LocalDate.of(2026, 11, 23))).isEqualTo(LocalDate.of(2026, 11, 23));
        assertThat(ReportService.weekStart(LocalDate.of(2026, 11, 29))).isEqualTo(LocalDate.of(2026, 11, 23));
    }
}
