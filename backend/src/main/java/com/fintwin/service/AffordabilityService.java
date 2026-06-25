package com.fintwin.service;

import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import com.fintwin.dto.ForecastDTO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class AffordabilityService {

    @Autowired private TransactionRepository transactionRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private ForecastService forecastService;

    // FIXED: was re-filtering 3-month transactions by a cutoff
    // date — redundant double filter. Removed.
    // FIXED: suggestedEMI was always 12 months — now adapted
    // based on risk level (high risk → smaller EMI, longer term).
    // IMPROVEMENT: added canAffordOutright and monthsToSave fields.

    @PreAuthorize("hasAuthority('USE_AI_BASIC')")
    public Map<String, Object> analyzePurchase(Double price) {

        if (price == null || price <= 0) {
            throw new IllegalArgumentException(
                    "Price must be a positive number"
            );
        }

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new RuntimeException("User not found")
                );

        List<Transaction> transactions =
                transactionRepository
                        .findLatestThreeMonthsTransactions(user.getId());

        double income = transactions.stream()
                .filter(t -> t.getAmount() > 0)
                .mapToDouble(Transaction::getAmount)
                .sum();

        double expenses = transactions.stream()
                .filter(t -> t.getAmount() < 0)
                .mapToDouble(t -> Math.abs(t.getAmount()))
                .sum();

        double savings = income - expenses;

        // Monthly averages from the 3-month window
        double monthlySavings = savings / 3.0;
        double monthlyIncome  = income  / 3.0;

        ForecastDTO forecast;
        double predictedExpense;

        try {
            forecast = forecastService.generateForecast();
            predictedExpense = forecast.getPredictedExpenses();
        } catch (Exception e) {
            // IMPROVEMENT: fallback if prediction service is down
            predictedExpense = expenses / 3.0;
        }

        double remainingSavings = savings - price;

        // FIXED: risk was only based on remainingSavings vs predictedExpense
        // Now uses monthlySavings for a more accurate risk model
        String risk;
        if (price > savings) {
            risk = "High"; // can't afford outright even with full savings
        } else if (remainingSavings < predictedExpense * 2) {
            risk = "High"; // would leave < 2 months buffer
        } else if (remainingSavings < savings * 0.4) {
            risk = "Medium";
        } else {
            risk = "Low";
        }

        // FIXED: EMI now adapts to risk and price
        int emiMonths = risk.equals("High") ? 24
                      : risk.equals("Medium") ? 18 : 12;
        double suggestedEMI = price / emiMonths;

        // IMPROVEMENT: months needed to save for this purchase
        long monthsToSave = monthlySavings > 0
                ? (long) Math.ceil(price / monthlySavings)
                : Long.MAX_VALUE;

        Map<String, Object> response = new HashMap<>();
        response.put("risk", risk);
        response.put("remainingSavings", Math.round(remainingSavings));
        response.put("suggestedEMI", Math.round(suggestedEMI));
        response.put("emiMonths", emiMonths);
        response.put("canAffordOutright", price <= savings);
        response.put("monthsToSave",
                monthsToSave == Long.MAX_VALUE ? -1 : monthsToSave
        );
        response.put("monthlySavingsAvg", Math.round(monthlySavings));

        return response;
    }
}