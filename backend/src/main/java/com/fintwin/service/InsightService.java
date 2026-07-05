package com.fintwin.service;

import com.fintwin.model.Transaction;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import com.fintwin.model.User;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class InsightService {

    @Autowired private TransactionRepository transactionRepository;
    @Autowired private UserRepository userRepository;

    @Cacheable(value = "user-insights",
               key = "T(com.fintwin.security.SecurityUtils).getCurrentUserEmail()")
    @PreAuthorize("hasAuthority('USE_AI_BASIC')")
    public List<String> generateInsights() {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new RuntimeException("User not found")
                );

        List<Transaction> transactions =
                transactionRepository
                        .findLatestThreeMonthsTransactions(user.getId());

        List<String> insights = new ArrayList<>();

        double income   = com.fintwin.util.TransactionMath.income(transactions);
        double expenses = com.fintwin.util.TransactionMath.expenses(transactions);

        double savings = income - expenses;
        int months = com.fintwin.util.TransactionMath.monthsPresent(transactions);
        double savingsRatio = income > 0 ? (savings / income) * 100 : 0;

        // Savings insight
        long savingsRounded = Math.round(savings / months);
        if (savingsRatio >= 40) {
            insights.add("💰 You're saving " + Math.round(savingsRatio) + "% of your income — well above the 20% benchmark. Make sure this surplus is actively invested, not sitting idle in a savings account.");
        } else if (savingsRatio >= 20) {
            insights.add("💰 Savings rate of " + Math.round(savingsRatio) + "% — you're on the right track. Increasing this by just 5% through one category cut could meaningfully accelerate your financial goals.");
        } else if (savings > 0) {
            insights.add("💡 Your savings rate is " + Math.round(savingsRatio) + "%, below the 20% recommended floor. Automate a fixed transfer of ₹" + String.format("%,d", savingsRounded) + " on payday before discretionary spending kicks in.");
        }

        // FIXED: category filtering with null guard
        // Keys normalized to lowercase so lookups don't silently miss when
        // categorization casing shifts ("food" vs "Food").
        Map<String, Double> categoryTotals = new HashMap<>();
        for (Transaction t : transactions) {
            if (t.getAmount() != null && t.getAmount() < 0 && t.getCategory() != null) {
                categoryTotals.merge(
                        t.getCategory().toLowerCase(),
                        Math.abs(t.getAmount()),
                        Double::sum
                );
            }
        }

        double monthlyIncome = income / (double) months;

        // FIXED: now income-relative thresholds
        double foodTotal = categoryTotals.getOrDefault("food", 0.0) / months;
        if (monthlyIncome > 0 && foodTotal / monthlyIncome > 0.20) {
            insights.add("🍔 Food is consuming " + Math.round(foodTotal / monthlyIncome * 100) + "% of your monthly income (₹" + String.format("%,d", Math.round(foodTotal)) + "/month). Meal prepping 3 days a week can realistically cut this by 20-25%.");
        }

        double travelTotal = categoryTotals.getOrDefault("travel", 0.0) / months;
        if (monthlyIncome > 0 && travelTotal / monthlyIncome > 0.15) {
            insights.add("🚕 Travel is taking up " + Math.round(travelTotal / monthlyIncome * 100) + "% of your income (₹" + String.format("%,d", Math.round(travelTotal)) + "/month). Consider switching high-frequency routes to public transport or a monthly pass.");
        }

        double shoppingTotal = categoryTotals.getOrDefault("shopping", 0.0) / months;
        if (monthlyIncome > 0 && shoppingTotal / monthlyIncome > 0.15) {
            insights.add("🛍️ Shopping accounts for " + Math.round(shoppingTotal / monthlyIncome * 100) + "% of your income this period. A 48-hour rule before non-essential purchases eliminates most impulse spending.");
        }

        // Entertainment
        double entertainmentTotal = categoryTotals.getOrDefault("entertainment", 0.0) / months;
        if (monthlyIncome > 0 && entertainmentTotal / monthlyIncome > 0.10) {
            insights.add("🎬 Entertainment spending is at " + Math.round(entertainmentTotal / monthlyIncome * 100) + "% of income. Audit your active subscriptions — most people pay for 2-3 they rarely use.");
        }

        // Positive income vs expenses
        if (income > 0 && expenses < income * 0.50) {
            insights.add("📈 Your expense-to-income ratio is under 50% — strong financial discipline. Channel the surplus into a diversified investment portfolio to put this gap to work.");
        }

        // High income, poor savings (lifestyle inflation warning)
        if (income > 0 && savingsRatio < 15 && expenses > income * 0.80) {
            insights.add("⚠️ You're spending over 80% of your income despite a healthy earnings level. This is a classic sign of lifestyle inflation — rising income matched by rising expenses. Identify one category to freeze for 30 days.");
        }

        return insights;
    }
}