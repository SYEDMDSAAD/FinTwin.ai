package com.fintwin.service;

import com.fintwin.model.FinancialGoal;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.FinancialGoalRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;

@Service
public class InvestmentRecommendationService {

    private static final Logger log =
            LoggerFactory.getLogger(InvestmentRecommendationService.class);

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private NetWorthService netWorthService;

    @Autowired
    private FinancialScoreService financialScoreService;

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

        // Monthly figures — the ai-service recommendation engine previously
        // received window totals and divided by a hardcoded 3.
        int months = com.fintwin.util.TransactionMath.monthsPresent(transactions);
        double income   = com.fintwin.util.TransactionMath.income(transactions) / months;
        double expenses = com.fintwin.util.TransactionMath.expenses(transactions) / months;

        double savings = income - expenses;

        double netWorth = netWorthService.getNetWorth().getNetWorth();

        int financialScore = financialScoreService.calculateScoreFor(user).getScore();

        String goalHealth = computeWorstGoalHealth(user);

        Map<String, Object> body = new HashMap<>();
        body.put("income",         income);
        body.put("expenses",       expenses);
        body.put("savings",        savings);
        body.put("financialScore", financialScore);
        body.put("netWorth",       netWorth);
        body.put("goalHealth",     goalHealth);

        try {
            Map response = aiRestTemplate.postForObject(
                    aiServiceUrl + "/investment-recommendation",
                    body,
                    Map.class
            );
            if (response != null) return response;
        } catch (Exception e) {
            log.warn("AI investment recommendation unavailable, using conservative fallback: {}",
                    e.getMessage());
        }
        return buildFallbackRecommendation(transactions, savings);
    }

    // Conservative rule-based fallback with the same response shape the
    // ai-service produces, so the frontend renders it identically.
    private Map<String, Object> buildFallbackRecommendation(
            List<Transaction> transactions, double savings) {

        double monthlySavings = Math.round(savings * 100.0) / 100.0;

        List<Map<String, Object>> recs = new ArrayList<>();
        if (monthlySavings > 0) {
            recs.add(rec("Fixed Deposit", 50, monthlySavings * 0.50,
                    "Guaranteed 6-7% returns while detailed analysis is unavailable."));
            recs.add(rec("Index Fund SIP", 30, monthlySavings * 0.30,
                    "Low-cost diversified equity exposure for long-term growth."));
            recs.add(rec("Emergency Fund", 20, monthlySavings * 0.20,
                    "Keep building an accessible safety buffer."));
        }

        Map<String, Object> result = new HashMap<>();
        result.put("riskProfile",             monthlySavings > 0 ? "Conservative" : "None");
        result.put("expectedReturn",          monthlySavings > 0 ? "6-9%" : "0%");
        result.put("investmentHorizon",       monthlySavings > 0 ? "3-5 Years" : "Not Applicable");
        result.put("portfolioScore",          50);
        result.put("monthlyInvestableAmount", Math.max(0, monthlySavings));
        result.put("recommendations",         recs);
        result.put("summary",
                "The AI advisor is temporarily unavailable — this is a conservative "
                + "default allocation based on your average monthly savings. "
                + "Check back later for a personalised recommendation.");
        return result;
    }

    private Map<String, Object> rec(String asset, int allocation, double amount, String reason) {
        Map<String, Object> m = new HashMap<>();
        m.put("asset",      asset);
        m.put("allocation", allocation);
        m.put("amount",     Math.round(amount * 100.0) / 100.0);
        m.put("reason",     reason);
        return m;
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
