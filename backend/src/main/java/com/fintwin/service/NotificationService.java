package com.fintwin.service;

import com.fintwin.dto.NotificationDTO;
import com.fintwin.exception.BadRequestException;
import com.fintwin.model.Budget;
import com.fintwin.model.FinancialGoal;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.*;
import com.fintwin.security.SecurityUtils;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
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

    @PreAuthorize("hasAuthority('READ_OWN_PROFILE')")
    public List<NotificationDTO> generateNotifications() {

        List<NotificationDTO> notifications = new ArrayList<>();

        String email = SecurityUtils.getCurrentUserEmail();
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

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
        for (Budget budget : budgets) {
            if (budget.getLimitAmount() == null || budget.getLimitAmount() <= 0) continue;

            double spent = transactions.stream()
                    .filter(t -> t.getCategory() != null
                            && t.getCategory().equalsIgnoreCase(budget.getCategory())
                            && t.getAmount() != null && t.getAmount() < 0)
                    .mapToDouble(t -> Math.abs(t.getAmount())).sum();

            double pct = (spent / budget.getLimitAmount()) * 100;
            long overshoot = Math.round(spent - budget.getLimitAmount());

            if (pct >= 100) {
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
            if (t.getAmount() != null && t.getAmount() < 0 && t.getMerchant() != null) {
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

        notifications.sort((a, b) -> Integer.compare(
                PRIORITY.getOrDefault(a.getType(), 5),
                PRIORITY.getOrDefault(b.getType(), 5)
        ));

        return notifications.stream().limit(7).toList();
    }

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
