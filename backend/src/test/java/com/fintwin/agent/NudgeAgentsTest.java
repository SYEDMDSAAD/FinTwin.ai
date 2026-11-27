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

    // ── SIP agent ───────────────────────────────────────────────────────────

    private static com.fintwin.model.SipPlan sip(String fund, int amount, LocalDate next) {
        com.fintwin.model.SipPlan p = new com.fintwin.model.SipPlan();
        p.setFundName(fund);
        p.setAmount(new java.math.BigDecimal(amount));
        p.setFrequency("Monthly");
        p.setNextDebitDate(next);
        return p;
    }

    @Test
    void aMonthlySipThatDidNotLeaveTheBankIsFlagged() {
        var plans = List.of(sip("Parag Parikh Flexi Cap", 5000, LocalDate.of(2026, 9, 5)));
        List<Transaction> paid = List.of(charge("BSE STAR MF", 5000.25, LocalDate.of(2026, 11, 6)),
                charge("SWIGGY", 400, LocalDate.of(2026, 11, 25)));
        assertThat(NudgeAgents.sipNudges(plans, paid, TODAY)).isEmpty();

        List<Transaction> missed = List.of(charge("SWIGGY", 400, LocalDate.of(2026, 11, 25)));
        assertThat(NudgeAgents.sipNudges(plans, missed, TODAY)).singleElement().satisfies(n -> {
            assertThat(n.getType()).isEqualTo("warning");
            assertThat(n.getMessage()).isEqualTo("Your ₹5,000 SIP in Parag Parikh Flexi Cap didn't go out around 5 Nov."
                    + " Check the bank balance or the mandate: a missed instalment isn't made up later.");
        });
    }

    @Test
    void noSipAlarmBeforeTheStatementReachesTheDateOrTheFirstInstalment() {
        // Statement only runs to 7 Nov: too early to say the 5 Nov instalment is missing
        assertThat(NudgeAgents.sipNudges(List.of(sip("Fund", 5000, LocalDate.of(2026, 9, 5))),
                List.of(charge("SWIGGY", 400, LocalDate.of(2026, 11, 7))), TODAY)).isEmpty();
        // First instalment is next month
        assertThat(NudgeAgents.sipNudges(List.of(sip("Fund", 5000, LocalDate.of(2026, 12, 5))),
                List.of(charge("SWIGGY", 400, LocalDate.of(2026, 11, 25))), TODAY)).isEmpty();
    }

    @Test
    void aSipOnThe31stFallsDueOnTheMonthsLastDay() {
        assertThat(NudgeAgents.lastDue(31, LocalDate.of(2026, 11, 23))).isEqualTo(LocalDate.of(2026, 10, 31));
        assertThat(NudgeAgents.lastDue(31, LocalDate.of(2026, 12, 2))).isEqualTo(LocalDate.of(2026, 11, 30));
        assertThat(NudgeAgents.lastDue(5, LocalDate.of(2026, 11, 23))).isEqualTo(LocalDate.of(2026, 11, 5));
    }

    @Test
    void theTaxNudgeOnlyComesInFebruaryAndMarchAndWhenItsWorthIt() {
        assertThat(NudgeAgents.taxSeason(LocalDate.of(2027, 2, 1))).isTrue();
        assertThat(NudgeAgents.taxSeason(LocalDate.of(2027, 3, 31))).isTrue();
        assertThat(NudgeAgents.taxSeason(LocalDate.of(2027, 4, 1))).isFalse();
        var small = new com.fintwin.util.TaxHarvest.Result(null, null, 0, 3_000, 3_000, List.of(), 0);
        var big = new com.fintwin.util.TaxHarvest.Result(null, null, 0, 90_000, 90_000, List.of(), 0);
        assertThat(NudgeAgents.taxNudge(small)).isNull();
        assertThat(NudgeAgents.taxNudge(big).getMessage()).startsWith("Before 31 March: about ₹90,000 of long-term gains");
    }

    @Test
    void aWishlistItemPastItsWaitAsksIfItsStillWanted() {
        assertThat(NudgeAgents.wishlistNudge(List.of())).isNull();
        var n = NudgeAgents.wishlistNudge(List.of(new com.fintwin.util.TwinMath.Wish("Headphones", 3499, "2026-11-25"),
                new com.fintwin.util.TwinMath.Wish("Shoes", 2000, "2026-11-26")));
        assertThat(n.getMessage()).isEqualTo("'Headphones' (₹3,499) (and 1 more) has waited two days on your wishlist."
                + " Still want it? If not, drop it in Spend Guard and your Future Twin invests the ₹3,499.");
    }

    @Test
    void aRaiseSuggestsTheSipStepUpThatKeepsTheSameShare() {
        var raised = new PlanDraftMath.Salary("ACME", 80_000, 1, 3, TODAY.minusDays(1), 88_000, TODAY.plusMonths(1));
        assertThat(NudgeAgents.stepUpNudge(raised, 10_000, TODAY).getMessage())
                .isEqualTo("This salary is about ₹8,000 more than usual. If it's a raise, adding ₹1,000 a month"
                        + " to your SIPs keeps the same share of it invested.");
        var same = new PlanDraftMath.Salary("ACME", 80_000, 1, 3, TODAY.minusDays(1), 81_000, TODAY.plusMonths(1));
        assertThat(NudgeAgents.stepUpNudge(same, 10_000, TODAY)).isNull();
        assertThat(NudgeAgents.stepUpNudge(raised, 0, TODAY)).isNull();                    // no SIPs to step up
        assertThat(NudgeAgents.stepUpNudge(raised, 10_000, TODAY.plusDays(10))).isNull();  // salary day has passed
    }
}
