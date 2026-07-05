package com.fintwin.service;

import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import com.fintwin.dto.ForecastDTO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class AffordabilityService {

    @Autowired private TransactionRepository transactionRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private ForecastService forecastService;
    @Autowired private NetWorthService netWorthService;

    // Assumed annual rate for the suggested-EMI estimate. Indian consumer
    // durable / personal-loan rates typically run 11-16% p.a.
    @Value("${fintwin.affordability.annual-interest-rate:14.0}")
    private double annualInterestRatePct;

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

        double income   = com.fintwin.util.TransactionMath.income(transactions);
        double expenses = com.fintwin.util.TransactionMath.expenses(transactions);

        // Monthly averages over the months actually present — a hardcoded /3
        // understated new users' monthly savings by up to 3x.
        int months = com.fintwin.util.TransactionMath.monthsPresent(transactions);
        double monthlySavings = (income - expenses) / months;

        // Affordability must be judged against what the user actually has,
        // not recent cash flow: a user with a healthy balance but a flat
        // 3-month flow can still afford the purchase. NetWorthService's
        // savings figure is the user's stated balance when present, falling
        // back to transactional flow for bank-connected users.
        double availableFunds = netWorthService.getNetWorth().getSavings();

        double predictedExpense;
        try {
            ForecastDTO forecast = forecastService.generateForecast();
            predictedExpense = forecast.getPredictedExpenses();
        } catch (Exception e) {
            // Fallback if prediction service is down
            predictedExpense = expenses / months;
        }

        double remainingSavings = availableFunds - price;

        // Emergency-fund ladder: how many months of predicted expenses would
        // remain after the purchase. < 2 months buffer is high risk, 2–4
        // months is medium, above that is low.
        String risk;
        if (price > availableFunds) {
            risk = "High"; // can't afford outright even with full savings
        } else if (remainingSavings < predictedExpense * 2) {
            risk = "High";
        } else if (remainingSavings < predictedExpense * 4) {
            risk = "Medium";
        } else {
            risk = "Low";
        }

        int emiMonths = risk.equals("High") ? 24
                      : risk.equals("Medium") ? 18 : 12;
        double suggestedEMI = computeEmi(price, annualInterestRatePct, emiMonths);

        long monthsToSave = monthlySavings > 0
                ? (long) Math.ceil(price / monthlySavings)
                : Long.MAX_VALUE;

        Map<String, Object> response = new HashMap<>();
        response.put("risk", risk);
        response.put("remainingSavings", Math.round(remainingSavings));
        response.put("suggestedEMI", Math.round(suggestedEMI));
        response.put("emiMonths", emiMonths);
        response.put("canAffordOutright", price <= availableFunds);
        response.put("monthsToSave",
                monthsToSave == Long.MAX_VALUE ? -1 : monthsToSave
        );
        response.put("monthlySavingsAvg", Math.round(monthlySavings));
        response.put("emiAnnualInterestRate", annualInterestRatePct);

        return response;
    }

    /**
     * Standard amortized EMI: P·r·(1+r)^n / ((1+r)^n − 1), where r is the
     * monthly rate. Flat price/n division (the previous behaviour) understates
     * the real payment — ~14% at 24 months is off by about 15%.
     */
    static double computeEmi(double principal, double annualRatePct, int months) {
        if (months <= 0) return principal;
        double r = annualRatePct / 100.0 / 12.0;
        if (r <= 0) return principal / months;
        double factor = Math.pow(1 + r, months);
        return principal * r * factor / (factor - 1);
    }
}