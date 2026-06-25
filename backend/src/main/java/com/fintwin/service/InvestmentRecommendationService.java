package com.fintwin.service;

import com.fintwin.model.FinancialGoal;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.FinancialGoalRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;

@Service
public class InvestmentRecommendationService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private NetWorthService netWorthService;

    @Autowired
    private FinancialGoalRepository goalRepository;

    @Autowired
    @Qualifier("aiRestTemplate")
    private RestTemplate aiRestTemplate;

    @Value("${ai.service.url}")
    private String aiServiceUrl;

    @PreAuthorize("hasAuthority('USE_AI_COPILOT')")
    public Map<String, Object> getRecommendation() {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow();

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

        double netWorth = netWorthService.getNetWorth().getNetWorth();

        int financialScore = computeFinancialScore(income, expenses, savings);

        String goalHealth = computeWorstGoalHealth(user);

        Map<String, Object> body = new HashMap<>();
        body.put("income",         income);
        body.put("expenses",       expenses);
        body.put("savings",        savings);
        body.put("financialScore", financialScore);
        body.put("netWorth",       netWorth);
        body.put("goalHealth",     goalHealth);

        return aiRestTemplate.postForObject(
                aiServiceUrl + "/investment-recommendation",
                body,
                Map.class
        );
    }

    // Same formula as ProfileService.calculateFinancialScore
    private int computeFinancialScore(double income, double expenses, double savings) {
        double ratio = income > 0 ? (savings / income) * 100 : 0;

        int score = 40;
        if      (ratio >= 40) score += 30;
        else if (ratio >= 30) score += 22;
        else if (ratio >= 20) score += 15;
        else if (ratio >= 10) score +=  8;

        if (income > 0) {
            double expenseRatio = expenses / income;
            if      (expenseRatio > 0.90) score -= 15;
            else if (expenseRatio > 0.80) score -= 10;
            else if (expenseRatio > 0.70) score -=  5;
        }

        if (income == 0) score -= 20;

        return Math.max(0, Math.min(100, score));
    }

    // Returns the worst health status across all user goals
    private String computeWorstGoalHealth(User user) {
        List<FinancialGoal> goals = goalRepository.findByUser(user);
        if (goals == null || goals.isEmpty()) return "On Track";

        List<String> priority = Arrays.asList("Critical", "At Risk", "On Track", "Excellent");

        return goals.stream()
                .map(FinancialGoal::getGoalHealth)
                .filter(Objects::nonNull)
                .min(Comparator.comparingInt(h -> {
                    int idx = priority.indexOf(h);
                    return idx == -1 ? priority.size() : idx;
                }))
                .orElse("On Track");
    }
}
