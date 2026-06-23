package com.fintwin.service;

import com.fintwin.dto.CategoryForecastDTO;
import com.fintwin.dto.ForecastDTO;
import com.fintwin.dto.MonthlyExpenseDTO;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;
import java.util.LinkedHashMap;

@Service
public class ForecastService {

    private static final Logger log = LoggerFactory.getLogger(ForecastService.class);

    private final TransactionRepository transactionRepository;
    private final UserRepository userRepository;

    @Value("${ai.service.url}")
    private String aiServiceUrl;

    @Autowired
    @Qualifier("aiRestTemplate")
    private RestTemplate aiRestTemplate;

    public ForecastService(
            TransactionRepository transactionRepository,
            UserRepository userRepository
    ) {
        this.transactionRepository = transactionRepository;
        this.userRepository = userRepository;
    }

    // =========================
    // GENERATE FORECAST
    // FIXED: was sending full Transaction objects to the
    // AI service — this leaks internal model fields (userId,
    // internal IDs). Now sends only {date, amount} maps.
    // IMPROVEMENT: added fallback when AI service is down
    // instead of crashing with unhandled exception.
    // =========================

    public ForecastDTO generateForecast() {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new RuntimeException("User not found")
                );

        List<Transaction> transactions =
                transactionRepository
                        .findLatestThreeMonthsTransactions(user.getId());

        if (transactions.isEmpty()) {
            return buildFallbackForecast(transactions, 0);
        }

        List<Map<String, Object>> txList = new ArrayList<>();
        double income = 0;

        for (Transaction t : transactions) {
            if (t.getAmount() != null && t.getAmount() > 0) {
                income += t.getAmount();
            }
            Map<String, Object> tx = new HashMap<>();
            tx.put("date", t.getDate());
            tx.put("amount", t.getAmount());
            tx.put("category",
                    t.getCategory() != null ? t.getCategory() : "Other"
            );
            txList.add(tx);
        }

        try {
            Map<String, Object> request = new HashMap<>();
            request.put("transactions", txList);

            Map response = aiRestTemplate.postForObject(
                    aiServiceUrl + "/forecast",
                    request,
                    Map.class
            );

            if (response == null) {
                return buildFallbackForecast(transactions, income);
            }

            return new ForecastDTO(
                    parseDouble(response, "predictedExpenses"),
                    parseDouble(response, "predictedSavings"),
                    parseDouble(response, "expenseGrowth"),
                    response.getOrDefault("insight", "AI insight unavailable")
                            .toString()
            );

        } catch (Exception e) {
            log.warn("AI forecast service unavailable ({}), using statistical fallback", e.getMessage());
            return buildFallbackForecast(transactions, income);
        }
    }

    // =========================
    // MONTHLY HISTORY
    // No logic bugs, added null guard on rows
    // =========================

    public List<MonthlyExpenseDTO> getMonthlyHistory() {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new RuntimeException("User not found")
                );

        // Java-side aggregation — required because Transaction.amount is
        // AES-256/GCM encrypted and cannot be aggregated at the SQL level
        List<Transaction> all = transactionRepository.findByUser(user);

        if (all == null || all.isEmpty()) {
            return Collections.emptyList();
        }

        // Group expense transactions (amount < 0) by YYYY-MM, sum absolute values
        Map<String, Double> byMonth = new LinkedHashMap<>();
        for (Transaction t : all) {
            if (t.getAmount() == null || t.getAmount() >= 0) continue;
            if (t.getDate() == null || t.getDate().length() < 7) continue;
            String month = t.getDate().substring(0, 7);
            byMonth.merge(month, Math.abs(t.getAmount()), Double::sum);
        }

        // Sort DESC, take last 3 months, then re-sort ASC (mirrors old SQL behaviour)
        return byMonth.entrySet().stream()
                .sorted(Map.Entry.<String, Double>comparingByKey().reversed())
                .limit(3)
                .sorted(Map.Entry.comparingByKey())
                .map(e -> new MonthlyExpenseDTO(e.getKey(),
                        Math.round(e.getValue() * 100.0) / 100.0))
                .toList();
    }

    // =========================
    // CATEGORY FORECAST
    // FIXED: used a switch-case on category name for growth
    // rates — fragile if category names change (case-sensitive).
    // Changed to case-insensitive map lookup with a default.
    // IMPROVEMENT: total is divided by 3 months to get a
    // true monthly average before applying growth rate,
    // preventing inflated 3-month totals being projected
    // as a single month forecast.
    // =========================

    private static final Map<String, Double> CATEGORY_GROWTH = Map.of(
            "food",          1.15,
            "shopping",      1.20,
            "travel",        1.10,
            "bills",         1.05,
            "entertainment", 1.08,
            "healthcare",    1.06,
            "housing",       1.03
    );

    public List<CategoryForecastDTO> getCategoryForecast() {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new RuntimeException("User not found")
                );

        List<Transaction> transactions =
                transactionRepository
                        .findLatestThreeMonthsTransactions(user.getId());

        Map<String, Double> categoryTotals = new HashMap<>();

        for (Transaction t : transactions) {
            if (t.getAmount() < 0) {
                String cat = t.getCategory() != null
                        ? t.getCategory() : "Other";
                categoryTotals.merge(
                        cat, Math.abs(t.getAmount()), Double::sum
                );
            }
        }

        List<CategoryForecastDTO> result = new ArrayList<>();

        categoryTotals.forEach((category, total) -> {

            // FIXED: was projecting 3-month sum — divide by 3 for monthly avg
            double monthlyAvg = total / 3.0;

            double growth = CATEGORY_GROWTH.getOrDefault(
                    category.toLowerCase(), 1.08
            );

            result.add(new CategoryForecastDTO(
                    category,
                    (double) Math.round(monthlyAvg * growth)
            ));
        });

        // Sort descending by forecasted amount
        result.sort((a, b) ->
                Double.compare(b.getPredictedAmount(), a.getPredictedAmount())
        );

        return result;
    }

    // =========================
    // PRIVATE HELPERS
    // =========================

    private double parseDouble(Map response, String key) {
        Object val = response.get(key);
        if (val == null) return 0.0;
        try {
            return Double.parseDouble(val.toString());
        } catch (NumberFormatException e) {
            return 0.0;
        }
    }

    private ForecastDTO buildFallbackForecast(
            List<Transaction> transactions, double income) {

        double expenses = transactions.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() < 0)
                .mapToDouble(t -> Math.abs(t.getAmount()))
                .sum();

        // Simple 3-month average as fallback
        double avgMonthlyExpense = expenses / 3.0;
        double avgMonthlySavings = (income / 3.0) - avgMonthlyExpense;

        return new ForecastDTO(
                Math.round(avgMonthlyExpense * 100.0) / 100.0,
                Math.round(avgMonthlySavings * 100.0) / 100.0,
                0.0,
                "Forecast based on your 3-month average spending."
        );
    }
}
