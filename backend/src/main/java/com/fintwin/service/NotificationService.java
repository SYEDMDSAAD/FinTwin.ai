package com.fintwin.service;

import com.fintwin.dto.NotificationDTO;
import com.fintwin.exception.BadRequestException;
import com.fintwin.exception.NotFoundException;
import com.fintwin.model.Budget;
import com.fintwin.model.FinancialGoal;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.*;
import com.fintwin.security.SecurityUtils;
import com.fintwin.util.CoverageMath;
import com.fintwin.util.PlanDraftMath;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.time.YearMonth;
import java.util.*;

@Service
public class NotificationService {

    private final TransactionRepository transactionRepository;
    private final BudgetRepository      budgetRepository;
    private final FinancialGoalRepository goalRepository;
    private final UserRepository        userRepository;

    public NotificationService(
            TransactionRepository transactionRepository,
            BudgetRepository budgetRepository,
            FinancialGoalRepository goalRepository,
            UserRepository userRepository) {
        this.transactionRepository = transactionRepository;
        this.budgetRepository      = budgetRepository;
        this.goalRepository        = goalRepository;
        this.userRepository        = userRepository;
    }

    private static final Map<String, Integer> PRIORITY =
            Map.of("danger", 1, "warning", 2, "success", 3, "info", 4);

    /** How many days after the salary lands the "split it" nudge stays up. */
    static final int SALARY_NUDGE_DAYS = 3;

    @PreAuthorize("hasAuthority('READ_OWN_PROFILE')")
    public List<NotificationDTO> generateNotifications() {

        List<NotificationDTO> notifications = new ArrayList<>();

        String email = SecurityUtils.getCurrentUserEmail();
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new NotFoundException("User not found"));

        List<Transaction> transactions = transactionRepository.findLatestThreeMonthsTransactions(user.getId());
        List<Budget> budgets = budgetRepository.findByUser(user);

        double income = transactions.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() > 0)
                .mapToDouble(Transaction::getAmount).sum();
        double expenses = transactions.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() < 0)
                .mapToDouble(t -> Math.abs(t.getAmount())).sum();
        double savings = income - expenses;
        double monthlyIncome = income / 3.0;

        // ── 1. Budget alerts (specific numbers) ──────────────────────────
        YearMonth thisMonth = YearMonth.now(java.time.ZoneId.of("Asia/Kolkata"));
        for (Budget budget : budgets) {
            if (budget.getLimitAmount() == null || budget.getLimitAmount() <= 0) continue;
            if (!budget.countsIn(thisMonth)) continue;

            // A budget is monthly: this month's spending only (it used to add up three months)
            double spent = transactions.stream()
                    .filter(t -> t.getDate() != null && YearMonth.from(t.getDate()).equals(thisMonth))
                    .filter(t -> t.getCategory() != null
                            && t.getCategory().equalsIgnoreCase(budget.getCategory())
                            && t.getAmount() != null && t.getAmount() < 0
                            && !com.fintwin.util.TransactionMath.isSelfTransfer(t))
                    .mapToDouble(t -> Math.abs(t.getAmount())).sum();

            double pct = (spent / budget.getLimitAmount()) * 100;
            long overshoot = Math.round(spent - budget.getLimitAmount());

            // Rent or a bill paid in full is done for the month, not an alert
            boolean fixedCost = com.fintwin.util.PlanDraftMath.isFixedCost(budget.getCategory());
            if (fixedCost && overshoot <= 0) continue;

            if (overshoot > 0) {
                notifications.add(new NotificationDTO("danger",
                        budget.getCategory() + " budget exceeded — ₹" + fmt(overshoot)
                        + " over the ₹" + fmt(Math.round(budget.getLimitAmount()))
                        + " limit (" + Math.round(pct) + "% used). Review and cut back immediately."
                ));
            } else if (pct >= 80) {
                long remaining = Math.round(budget.getLimitAmount() - spent);
                notifications.add(new NotificationDTO("warning",
                        budget.getCategory() + " is at " + Math.round(pct) + "% of budget — "
                        + "₹" + fmt(remaining) + " remaining. Slow down spending to stay within limit."
                ));
            }
        }

        // ── 2. High merchant concentration ───────────────────────────────
        Map<String, Double> merchantTotals = new HashMap<>();
        for (Transaction t : transactions) {
            // Not rent, EMIs, bills or money to people: a cap on the landlord or
            // on what you send Mom isn't advice anyone can use
            if (t.getAmount() != null && t.getAmount() < 0 && t.getMerchant() != null
                    && !com.fintwin.util.PlanDraftMath.isFixedCost(t.getCategory())
                    && !"People".equalsIgnoreCase(t.getCategory())) {
                merchantTotals.merge(t.getMerchant(), Math.abs(t.getAmount()), Double::sum);
            }
        }

        merchantTotals.entrySet().stream()
                .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                .limit(3)
                .forEach(entry -> {
                    double pct = monthlyIncome > 0 ? entry.getValue() / monthlyIncome * 100 : 0;
                    if (monthlyIncome > 0 && pct > 20) {
                        notifications.add(new NotificationDTO("warning",
                                "₹" + fmt(Math.round(entry.getValue())) + " spent at " + entry.getKey()
                                + " over 3 months (" + Math.round(pct) + "% of monthly income)."
                                + " Consider setting a monthly cap for this merchant."
                        ));
                    }
                });

        // ── 3. Savings rate with actual number ───────────────────────────
        if (income > 0) {
            double savingsRate = (savings / income) * 100;
            long monthlySavings = Math.round(savings / 3.0);

            if (savingsRate >= 40) {
                notifications.add(new NotificationDTO("success",
                        "Savings rate is " + fmt(savingsRate) + "% — ₹" + fmt(monthlySavings)
                        + "/month average. Put this surplus to work in an index fund or RD."
                ));
            } else if (savingsRate >= 20) {
                notifications.add(new NotificationDTO("success",
                        "Savings rate of " + fmt(savingsRate) + "% (₹" + fmt(monthlySavings)
                        + "/month) is healthy. Aim for 30% by trimming one discretionary category."
                ));
            } else if (savingsRate >= 0) {
                long gap = Math.round((income * 0.20 - savings) / 3.0);
                notifications.add(new NotificationDTO("warning",
                        "Savings rate is " + fmt(savingsRate) + "% — ₹" + fmt(gap)
                        + "/month short of the 20% target. Automate a fixed transfer on payday."
                ));
            } else {
                notifications.add(new NotificationDTO("danger",
                        "Spending exceeds income by ₹" + fmt(Math.round(Math.abs(savings) / 3.0))
                        + "/month. You are drawing down savings. Address this immediately."
                ));
            }
        }

        // ── 4. Overspending relative to income ───────────────────────────
        if (income > 0 && expenses > income * 0.85) {
            double expPct = expenses / income * 100;
            notifications.add(new NotificationDTO("danger",
                    "Expenses are " + Math.round(expPct) + "% of income over 3 months — "
                    + "₹" + fmt(Math.round(expenses / 3.0)) + "/month on average. "
                    + "Identify and freeze your two highest non-essential categories."
            ));
        }

        // ── 5. Goal progress with specifics ──────────────────────────────
        List<FinancialGoal> goals = goalRepository.findByUser(user);
        for (FinancialGoal goal : goals) {
            double progress = goal.getTargetAmount() > 0
                    ? (goal.getCurrentSaved() / goal.getTargetAmount()) * 100 : 0;
            long monthsElapsed = goal.getCreatedAt() == null ? 0
                    : ChronoUnit.MONTHS.between(goal.getCreatedAt(), LocalDate.now());

            if (monthsElapsed >= 1 && goal.getDurationMonths() > 0) {
                double expected = (monthsElapsed / (double) goal.getDurationMonths()) * 100;
                if (progress < expected * 0.5) {
                    long shortfall = Math.round(goal.getTargetAmount() * expected / 100 - goal.getCurrentSaved());
                    notifications.add(new NotificationDTO("warning",
                            "'" + goal.getTitle() + "' is behind schedule — "
                            + Math.round(progress) + "% saved vs " + Math.round(expected) + "% expected. "
                            + "₹" + fmt(shortfall) + " shortfall. Increase monthly contribution to catch up."
                    ));
                }
            }

            if (progress >= 90) {
                notifications.add(new NotificationDTO("success",
                        "'" + goal.getTitle() + "' is " + Math.round(progress) + "% complete — "
                        + "₹" + fmt(Math.round(goal.getTargetAmount() - goal.getCurrentSaved()))
                        + " left to reach ₹" + fmt(Math.round(goal.getTargetAmount())) + ". Almost there."
                ));
            } else if (progress >= 70) {
                notifications.add(new NotificationDTO("success",
                        "'" + goal.getTitle() + "' is " + Math.round(progress) + "% complete. "
                        + "Keep the current pace to finish on time."
                ));
            }
        }

        // ── 6. Subscription concentration ────────────────────────────────
        long highMerchantCount = merchantTotals.values().stream()
                .filter(v -> v > 3000).count();
        if (highMerchantCount >= 3) {
            notifications.add(new NotificationDTO("info",
                    highMerchantCount + " merchants each account for over ₹3,000 in the last 3 months. "
                    + "Audit your active subscriptions — cancelling even one unused service compounds over time."
            ));
        }

        // ── 7. Statement nudges ───────────────────────────────────────────
        // Without a bank link nothing arrives by itself: a month with no
        // statement looks like a month with no spending unless someone says so
        java.time.LocalDate today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata"));
        for (CoverageMath.AccountCoverage c : CoverageMath.coverage(transactions, today)) {
            java.time.YearMonth month = c.nudgeFor(today);
            if (month == null) continue;
            notifications.add(new NotificationDTO("info",
                    "Upload your " + CoverageMath.monthName(month, today) + " statement for " + c.account()
                    + " to close the month — until then its spending isn't counted."
            ));
        }

        // ── 8. Salary day ────────────────────────────────────────────────
        // The salary just landed: the moment to split it, before it's spent
        PlanDraftMath.Salary salary = PlanDraftMath.detectSalary(transactions, today);
        if (salary != null && !salary.lastPaid().isAfter(today)
                && salary.lastPaid().isAfter(today.minusDays(SALARY_NUDGE_DAYS + 1))) {
            notifications.add(new NotificationDTO("success",
                    "Salary of ₹" + fmt(Math.round(salary.lastAmount())) + " arrived. Split it into bills, goals and"
                    + " weekly spending before it goes: open Spend Guard → Salary day."
            ));
        }

        // ── 9. What the agents did or noticed (last 7 days) ──────────────
        // Watch alerts sort with warnings; the sorting summary with info.
        List<NotificationDTO> agents = new ArrayList<>(agentNotifications(user));
        if (nudgeAgents != null) {
            agents.addAll(nudgeAgents.all(user, transactions, today, !budgets.isEmpty()));
        }
        return bell(notifications, agents);
    }

    /** Most lines the bell shows. */
    static final int BELL_SIZE = 12;
    /** Room kept for each side: the rule alerts above, and the agents. */
    static final int BELL_SHARE = 7;

    /**
     * The bell's list: rule alerts and agent lines each sorted by priority,
     * each given up to BELL_SHARE places (more when the other side has
     * fewer), then shown together by priority. Without this, a month with a
     * few budgets over the limit filled every place and no agent was heard.
     */
    static List<NotificationDTO> bell(List<NotificationDTO> rules, List<NotificationDTO> agents) {
        Comparator<NotificationDTO> byPriority = Comparator.comparingInt(n -> PRIORITY.getOrDefault(n.getType(), 5));
        List<NotificationDTO> r = rules.stream().sorted(byPriority).toList();
        List<NotificationDTO> a = agents.stream().sorted(byPriority).toList();
        int fromAgents = Math.min(a.size(), Math.max(BELL_SHARE, BELL_SIZE - r.size()));
        int fromRules = Math.min(r.size(), BELL_SIZE - fromAgents);
        List<NotificationDTO> out = new ArrayList<>(r.subList(0, fromRules));
        out.addAll(a.subList(0, fromAgents));
        out.sort(byPriority);
        return out;
    }

    /** How long an agent's alert stays in the bell. */
    static final int AGENT_ALERT_DAYS = 7;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.fintwin.repository.AgentAlertRepository agentAlerts;

    /** Weekly, budget, subscription and goal agents (worked out on each bell load). */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.fintwin.agent.NudgeAgents nudgeAgents;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.fintwin.repository.DismissedAnomalyRepository dismissedAnomalies;

    /**
     * The agents' recent alerts, newest first. A watch alert disappears once
     * the user dismisses its anomaly on the Insights page ("that's fine").
     */
    List<NotificationDTO> agentNotifications(User user) {
        if (agentAlerts == null) return List.of();
        Set<String> dismissed = new HashSet<>();
        if (dismissedAnomalies != null) {
            dismissedAnomalies.findByUser(user).forEach(p ->
                    dismissed.add(p.getAnomalyType() + "|" + (p.getMerchant() == null ? "" : p.getMerchant())));
        }
        java.time.LocalDateTime since = java.time.LocalDateTime.now().minusDays(AGENT_ALERT_DAYS);
        List<NotificationDTO> out = new ArrayList<>();
        boolean sortShown = false;
        int watchShown = 0;
        for (com.fintwin.model.AgentAlert a : agentAlerts.findByUserAndCreatedAtAfterOrderByCreatedAtDesc(user, since)) {
            if (com.fintwin.model.AgentAlert.WATCH.equals(a.getAgent())) {
                // The newest two: the Anomalies page has the rest, and the other agents need room too
                if (watchShown >= WATCH_IN_BELL) continue;
                String key = a.getAnomalyType() + "|" + (a.getMerchant() == null ? "" : a.getMerchant());
                if (!dismissed.contains(key)) { out.add(new NotificationDTO("warning", a.getMessage())); watchShown++; }
            } else if (!sortShown) {
                // Only the latest sorting summary: older ones are covered by it.
                out.add(new NotificationDTO("info", a.getMessage()));
                sortShown = true;
            }
        }
        return out;
    }

    static final int WATCH_IN_BELL = 2;

    @PreAuthorize("hasAuthority('WRITE_OWN_PROFILE')")
    public void deleteNotification(int index) {
        if (index < 0) throw new BadRequestException("Invalid notification index");
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_PROFILE')")
    public void markAsRead(int index) {
        if (index < 0) throw new BadRequestException("Invalid notification index");
    }

    private String fmt(long v)   { return String.format("%,d", v); }
    private String fmt(double v) { return String.format("%.1f", v); }
}
