package com.fintwin.agent;

import com.fintwin.dto.NotificationDTO;
import com.fintwin.model.FinancialGoal;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.WeeklyReportRecordRepository;
import com.fintwin.service.GoalPlannerService;
import com.fintwin.service.PlanDraftService;
import com.fintwin.service.ReportService;
import com.fintwin.util.PlanDraftMath;
import com.fintwin.util.RecurringMath;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * The agents that speak through the bell, worked out fresh each time it's
 * opened so they're never stale:
 *
 *  - weekly:       this week's report is waiting (written by the weekly agent)
 *  - budget:       a drafted set of budgets when there are none, or a budget
 *                  well below what the user really spends
 *  - subscription: a renewal in the next three days, or a price rise
 *  - goal:         on salary day, how much to set aside for a goal that's behind
 *
 * Each one only points at something the user then does themselves (accept a
 * draft, set money aside); none changes data. Failures drop that nudge only.
 */
@Component
public class NudgeAgents {

    private static final Logger log = LoggerFactory.getLogger(NudgeAgents.class);
    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("MMM yyyy", Locale.ENGLISH);

    /** Days after the salary lands that the goal nudge shows (as the salary-day nudge does). */
    static final int SALARY_DAYS = 3;
    /** The goal nudge never asks for more than this share of the salary. */
    static final double MAX_SHARE_OF_SALARY = 0.30;

    @Autowired @Lazy private PlanDraftService planDraft;
    @Autowired @Lazy private GoalPlannerService goals;
    @Autowired private TransactionRepository transactions;
    @Autowired private WeeklyReportRecordRepository weeklyReports;

    public List<NotificationDTO> all(User user, List<Transaction> lastThreeMonths, LocalDate today, boolean hasBudgets) {
        List<NotificationDTO> out = new ArrayList<>();
        try {
            weeklyReports.findByUserAndWeekStart(user, ReportService.weekStart(today))
                    .filter(r -> r.getViewedAt() == null)
                    .ifPresent(r -> out.add(new NotificationDTO("info",
                            "Your weekly report is ready. Open Executive Reports to read it.")));
        } catch (RuntimeException e) { log.debug("weekly nudge skipped: {}", e.getClass().getSimpleName()); }
        try {
            out.addAll(budgetNudges(planDraft.draftFor(user, today), hasBudgets));
        } catch (RuntimeException e) { log.debug("budget nudge skipped: {}", e.getClass().getSimpleName()); }
        try {
            List<Transaction> year = transactions.findSince(user.getId(),
                    today.minusMonths(RecurringMath.WINDOW_MONTHS).withDayOfMonth(1));
            out.addAll(subscriptionNudges(year, today));
        } catch (RuntimeException e) { log.debug("subscription nudge skipped: {}", e.getClass().getSimpleName()); }
        try {
            PlanDraftMath.Salary salary = PlanDraftMath.detectSalary(lastThreeMonths, today);
            NotificationDTO g = goalNudge(goals.getGoalsForUser(user), salary, today);
            if (g != null) out.add(g);
        } catch (RuntimeException e) { log.debug("goal nudge skipped: {}", e.getClass().getSimpleName()); }
        return out;
    }

    // ── Budget agent ────────────────────────────────────────────────────────

    static List<NotificationDTO> budgetNudges(PlanDraftMath.Draft draft, boolean hasBudgets) {
        if (draft == null || draft.monthsUsed() < 1 || draft.budgets() == null) return List.of();
        List<PlanDraftMath.BudgetLine> lines = draft.budgets().stream().filter(l -> l.suggested() > 0).toList();
        if (!hasBudgets) {
            if (lines.size() < 2) return List.of();
            long total = Math.round(lines.stream().mapToDouble(PlanDraftMath.BudgetLine::suggested).sum());
            return List.of(new NotificationDTO("info",
                    "FinTwin drafted " + lines.size() + " budgets from your last " + draft.monthsUsed()
                            + (draft.monthsUsed() == 1 ? " month" : " months") + " of spending (" + rupees(total)
                            + " a month in all). Review and accept them under Budgets."));
        }
        // A limit well below what the user really spends just fires an alert every month.
        return lines.stream()
                .filter(l -> l.currentLimit() != null && l.currentLimit() > 0)
                .filter(l -> l.typical() > l.currentLimit() * 1.15 && l.typical() - l.currentLimit() >= 500)
                .max(Comparator.comparingDouble(l -> l.typical() - l.currentLimit()))
                .map(l -> List.of(new NotificationDTO("info",
                        "Your " + l.category() + " budget of " + rupees(l.currentLimit())
                                + " is below what you usually spend (" + rupees(l.typical())
                                + " a month). FinTwin's draft suggests " + rupees(l.suggested())
                                + ". Review it under Budgets.")))
                .orElse(List.of());
    }

    // ── Subscription agent ──────────────────────────────────────────────────

    static List<NotificationDTO> subscriptionNudges(List<Transaction> lastYear, LocalDate today) {
        List<NotificationDTO> out = new ArrayList<>();
        int renewals = 0, rises = 0;
        for (RecurringMath.Recurrence r : RecurringMath.detectAll(lastYear, today)) {
            if (!r.active()) continue;

            // Renewing in the next three days: monthly or longer, a fixed price
            if (renewals < 2 && !r.amountVaries() && r.cadenceDays() >= 28 && r.typicalAmount() >= 99
                    && r.nextChargeDate() != null) {
                long days = ChronoUnit.DAYS.between(today, r.nextChargeDate());
                if (days >= 0 && days <= 3) {
                    String when = days == 0 ? "today" : days == 1 ? "tomorrow" : "in " + days + " days";
                    out.add(new NotificationDTO("info", r.merchant() + " renews " + when + ": about "
                            + rupees(r.typicalAmount()) + ". Cancel before then if you don't use it."));
                    renewals++;
                }
            }

            // The latest charge costs more than the ones before it
            if (rises < 2) {
                NotificationDTO rise = priceRise(r, lastYear, today);
                if (rise != null) { out.add(rise); rises++; }
            }
        }
        return out;
    }

    static NotificationDTO priceRise(RecurringMath.Recurrence r, List<Transaction> lastYear, LocalDate today) {
        String key = RecurringMath.normalizeMerchant(r.merchant());
        List<Transaction> charges = lastYear.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() < 0 && t.getDate() != null && t.getMerchant() != null)
                .filter(t -> RecurringMath.normalizeMerchant(t.getMerchant()).equals(key))
                .sorted(Comparator.comparing(Transaction::getDate))
                .toList();
        if (charges.size() < 3) return null;
        Transaction last = charges.get(charges.size() - 1);
        if (last.getDate().isBefore(today.minusDays(14))) return null;
        double latest = -last.getAmount();
        double before = median(charges.subList(0, charges.size() - 1).stream().mapToDouble(t -> -t.getAmount()).toArray());
        if (latest < before * 1.08 || latest - before < 20) return null;
        double perYear = (latest - before) * 365.0 / Math.max(7, r.cadenceDays());
        return new NotificationDTO("warning", r.merchant() + " went up from " + rupees(before) + " to "
                + rupees(latest) + ": about " + rupees(perYear) + " more a year.");
    }

    private static double median(double[] v) {
        double[] s = v.clone();
        Arrays.sort(s);
        int n = s.length;
        return n % 2 == 1 ? s[n / 2] : (s[n / 2 - 1] + s[n / 2]) / 2.0;
    }

    // ── Goal agent ──────────────────────────────────────────────────────────

    static NotificationDTO goalNudge(List<FinancialGoal> goals, PlanDraftMath.Salary salary, LocalDate today) {
        if (salary == null || salary.lastPaid() == null || salary.lastPaid().isAfter(today)
                || !salary.lastPaid().isAfter(today.minusDays(SALARY_DAYS + 1))) return null;

        FinancialGoal pick = null;
        LocalDate pickDue = null;
        double pickNeed = 0;
        for (FinancialGoal g : goals == null ? List.<FinancialGoal>of() : goals) {
            if (Boolean.TRUE.equals(g.getCompleted()) || g.getTargetAmount() == null || g.getCreatedAt() == null
                    || g.getDurationMonths() == null || g.getDurationMonths() <= 0) continue;
            String health = g.getGoalHealth();
            if (!"At Risk".equals(health) && !"Critical".equals(health)) continue;
            LocalDate due = g.getCreatedAt().plusMonths(g.getDurationMonths());
            if (!due.isAfter(today)) continue;
            double saved = g.getExpectedSaved() == null ? 0 : g.getExpectedSaved();
            double remaining = g.getTargetAmount() - saved;
            if (remaining <= 0) continue;
            // Whole months left, rounded down: a part month isn't a full month of saving
            long monthsLeft = Math.max(1, (long) Math.floor(ChronoUnit.DAYS.between(today, due) / 30.44));
            double need = remaining / monthsLeft;
            // The goal that's due first is the one to fund first
            if (pick == null || due.isBefore(pickDue)) { pick = g; pickDue = due; pickNeed = need; }
        }
        if (pick == null) return null;

        double amount = Math.min(pickNeed, salary.lastAmount() * MAX_SHARE_OF_SALARY);
        long rounded = (long) Math.ceil(amount / 100.0) * 100;
        if (rounded < 100) return null;
        return new NotificationDTO("info", "From this salary, " + rupees(rounded) + " towards '" + pick.getTitle()
                + "' would get it back on track for " + pickDue.format(MONTH)
                + ". Set it aside in Spend Guard → Salary day.");
    }

    static String rupees(double v) {
        return "₹" + String.format(Locale.ENGLISH, "%,d", Math.round(v));
    }
}
