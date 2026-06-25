package com.fintwin.service;

import com.fintwin.dto.BudgetStatusDTO;
import com.fintwin.dto.FinancialScoreDTO;
import com.fintwin.dto.FinancialScoreDTO.FactorDTO;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * FinTwin Score™ — financial health score out of 100.
 *
 * Five factors, fixed weights, no hidden penalties:
 *   Savings Rate          30 pts
 *   Expense Control       25 pts
 *   Budget Discipline     20 pts
 *   Spending Consistency  15 pts
 *   Income Stability      10 pts
 */
@Service
public class FinancialScoreService {

    private final TransactionRepository transactionRepository;
    private final UserRepository        userRepository;
    private final BudgetService         budgetService;
    private final AnalyticsService      analyticsService;

    public FinancialScoreService(
            TransactionRepository transactionRepository,
            UserRepository        userRepository,
            BudgetService         budgetService,
            AnalyticsService      analyticsService) {
        this.transactionRepository = transactionRepository;
        this.userRepository        = userRepository;
        this.budgetService         = budgetService;
        this.analyticsService      = analyticsService;
    }

    @PreAuthorize("hasAuthority('READ_OWN_PROFILE')")
    @Cacheable(value = "user-score",
               key = "T(com.fintwin.security.SecurityUtils).getCurrentUserEmail()")
    public FinancialScoreDTO calculateScore() {

        String email = SecurityUtils.getCurrentUserEmail();
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

        List<Transaction> txns = transactionRepository.findLatestThreeMonthsTransactions(user.getId());

        double income   = txns.stream().filter(t -> t.getAmount() != null && t.getAmount() > 0)
                              .mapToDouble(Transaction::getAmount).sum();
        double expenses = txns.stream().filter(t -> t.getAmount() != null && t.getAmount() < 0)
                              .mapToDouble(t -> Math.abs(t.getAmount())).sum();
        double savingsRate = income > 0 ? (income - expenses) / income * 100 : 0;

        // ── 1. Savings Rate (max 30 pts) ──────────────────────────────────
        int savingsPts;
        String savingsStatus, savingsDesc;
        if (savingsRate >= 40) {
            savingsPts = 30; savingsStatus = "good";
            savingsDesc = "Outstanding savings rate of " + fmt(savingsRate) + "%. You're building wealth consistently.";
        } else if (savingsRate >= 30) {
            savingsPts = 25; savingsStatus = "good";
            savingsDesc = "Strong savings rate of " + fmt(savingsRate) + "%. Well above the 20% benchmark.";
        } else if (savingsRate >= 20) {
            savingsPts = 20; savingsStatus = "good";
            savingsDesc = "Healthy savings rate of " + fmt(savingsRate) + "%. You're meeting the recommended minimum.";
        } else if (savingsRate >= 10) {
            savingsPts = 12; savingsStatus = "warning";
            savingsDesc = "Savings rate of " + fmt(savingsRate) + "% is below the 20% target. Small cuts add up.";
        } else if (savingsRate >= 0) {
            savingsPts = 5; savingsStatus = "warning";
            savingsDesc = "Very low savings rate of " + fmt(savingsRate) + "%. Focus on reducing discretionary spend.";
        } else {
            savingsPts = 0; savingsStatus = "poor";
            savingsDesc = "Spending exceeds income this period. Immediate budget review recommended.";
        }

        // ── 2. Expense Control (max 25 pts) ───────────────────────────────
        double expenseRatio = income > 0 ? expenses / income : 1.0;
        int expensePts;
        String expenseStatus, expenseDesc;
        if (expenseRatio <= 0.50) {
            expensePts = 25; expenseStatus = "good";
            expenseDesc = "Expenses are only " + fmt(expenseRatio * 100) + "% of income — excellent cost discipline.";
        } else if (expenseRatio <= 0.65) {
            expensePts = 20; expenseStatus = "good";
            expenseDesc = "Expenses at " + fmt(expenseRatio * 100) + "% of income — comfortably within safe range.";
        } else if (expenseRatio <= 0.80) {
            expensePts = 14; expenseStatus = "warning";
            expenseDesc = "Spending " + fmt(expenseRatio * 100) + "% of income. Aim to bring this below 70%.";
        } else if (expenseRatio <= 0.95) {
            expensePts = 7; expenseStatus = "warning";
            expenseDesc = "Spending " + fmt(expenseRatio * 100) + "% of income leaves very little buffer.";
        } else {
            expensePts = 0; expenseStatus = "poor";
            expenseDesc = "Expenses match or exceed income. No financial runway — address this immediately.";
        }

        // ── 3. Budget Discipline (max 20 pts) ─────────────────────────────
        List<BudgetStatusDTO> budgets = budgetService.getBudgetStatus();
        long exceeded = budgets.stream().filter(BudgetStatusDTO::getExceeded).count();
        int total     = budgets.size();
        int budgetPts;
        String budgetStatus, budgetDesc;
        if (total == 0) {
            budgetPts = 10; budgetStatus = "neutral";
            budgetDesc = "No budgets set yet. Adding category budgets will help track and score your discipline.";
        } else if (exceeded == 0) {
            budgetPts = 20; budgetStatus = "good";
            budgetDesc = "All " + total + " budget" + (total > 1 ? "s" : "") + " within limits. Perfect budget adherence this period.";
        } else if (exceeded <= total / 2) {
            budgetPts = 12; budgetStatus = "warning";
            budgetDesc = exceeded + " of " + total + " budgets exceeded. Review those categories and tighten the caps.";
        } else {
            budgetPts = 4; budgetStatus = "poor";
            budgetDesc = exceeded + " of " + total + " budgets exceeded. Budgets aren't being followed — revisit your limits.";
        }

        // ── 4. Spending Consistency (max 15 pts) ──────────────────────────
        Map<String, Double> byMonth = txns.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() < 0 && t.getDate() != null)
                .collect(Collectors.groupingBy(
                        t -> t.getDate().toString().substring(0, 7),
                        Collectors.summingDouble(t -> Math.abs(t.getAmount()))
                ));
        int consistencyPts;
        String consistencyStatus, consistencyDesc;
        if (byMonth.size() < 2) {
            consistencyPts = 10; consistencyStatus = "neutral";
            consistencyDesc = "Not enough monthly data to assess spending consistency yet.";
        } else {
            double mean = byMonth.values().stream().mapToDouble(d -> d).average().orElse(0);
            double variance = byMonth.values().stream()
                    .mapToDouble(d -> Math.pow(d - mean, 2)).average().orElse(0);
            double cv = mean > 0 ? Math.sqrt(variance) / mean * 100 : 100;
            if (cv < 10) {
                consistencyPts = 15; consistencyStatus = "good";
                consistencyDesc = "Very stable monthly spending — minimal variance signals strong financial control.";
            } else if (cv < 25) {
                consistencyPts = 11; consistencyStatus = "good";
                consistencyDesc = "Reasonably consistent spending with minor month-to-month fluctuations.";
            } else if (cv < 50) {
                consistencyPts = 6; consistencyStatus = "warning";
                consistencyDesc = "Noticeable spending swings across months. Try to plan ahead for irregular costs.";
            } else {
                consistencyPts = 2; consistencyStatus = "poor";
                consistencyDesc = "High spending volatility. Erratic patterns make budgeting and saving harder.";
            }
        }

        // ── 5. Income Stability (max 10 pts) ──────────────────────────────
        Map<String, Long> incomeByMonth = txns.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() > 0 && t.getDate() != null)
                .collect(Collectors.groupingBy(
                        t -> t.getDate().toString().substring(0, 7),
                        Collectors.counting()
                ));
        int incomePts;
        String incomeStatus, incomeDesc;
        if (incomeByMonth.size() >= 3) {
            incomePts = 10; incomeStatus = "good";
            incomeDesc = "Income recorded across all 3 months — consistent earnings strengthen your score.";
        } else if (incomeByMonth.size() == 2) {
            incomePts = 6; incomeStatus = "warning";
            incomeDesc = "Income visible in 2 of 3 months. Keep transactions up to date for a full picture.";
        } else if (incomeByMonth.size() == 1) {
            incomePts = 3; incomeStatus = "warning";
            incomeDesc = "Income only in 1 month. Add more data or connect your bank account for accuracy.";
        } else {
            incomePts = 0; incomeStatus = "poor";
            incomeDesc = "No income transactions found. Connect your bank or add income entries manually.";
        }

        // ── Final Score ───────────────────────────────────────────────────
        int score = savingsPts + expensePts + budgetPts + consistencyPts + incomePts;
        score = Math.max(0, Math.min(100, score));

        String rating;
        if      (score >= 85) rating = "Excellent";
        else if (score >= 70) rating = "Good";
        else if (score >= 50) rating = "Average";
        else                  rating = "Poor";

        int recurringCount = analyticsService.getRecurringExpenses().size();

        List<FactorDTO> factors = List.of(
            new FactorDTO("Savings Rate",          "High",   savingsPts,     30, savingsStatus,     savingsDesc),
            new FactorDTO("Expense Control",        "High",   expensePts,     25, expenseStatus,     expenseDesc),
            new FactorDTO("Budget Discipline",      "Medium", budgetPts,      20, budgetStatus,      budgetDesc),
            new FactorDTO("Spending Consistency",   "Medium", consistencyPts, 15, consistencyStatus, consistencyDesc),
            new FactorDTO("Income Stability",       "Low",    incomePts,      10, incomeStatus,      incomeDesc)
        );

        double roundedSavingsRate = Math.round(savingsRate * 100.0) / 100.0;
        int budgetDisciplinePct = total > 0
                ? (int) Math.round((double)(total - exceeded) / total * 100)
                : 0;

        return new FinancialScoreDTO(score, rating, roundedSavingsRate, budgetDisciplinePct, recurringCount, factors);
    }

    private String fmt(double v) {
        return String.valueOf(Math.round(v * 10) / 10.0);
    }
}
