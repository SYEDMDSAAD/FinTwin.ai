package com.fintwin.service;

import com.fintwin.config.FinTwinMetrics;
import com.fintwin.dto.CategoryForecastDTO;
import com.fintwin.dto.ForecastDTO;
import com.fintwin.dto.MonthlyExpenseDTO;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.security.access.prepost.PreAuthorize;
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

    @Autowired
    private FinTwinMetrics metrics;

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

    @PreAuthorize("hasAuthority('USE_AI_FORECAST')")
    @Cacheable(value = "user-forecast",
               key = "T(com.fintwin.security.SecurityUtils).getCurrentUserEmail()")
    @CircuitBreaker(name = "ai-service", fallbackMethod = "generateForecastFallback")
    @Retry(name = "ai-service")
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
            tx.put("date", t.getDate() != null ? t.getDate().toString() : null);
            tx.put("amount", t.getAmount());
            tx.put("category",
                    t.getCategory() != null ? t.getCategory() : "Other"
            );
            txList.add(tx);
        }

        metrics.aiForecastCalls.increment();

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
    }

    // Resilience4j calls this when the circuit is open or all retries are exhausted
    @SuppressWarnings("unused")
    public ForecastDTO generateForecastFallback(Exception ex) {
        log.warn("AI forecast circuit open or retries exhausted ({}), using statistical fallback", ex.getMessage());
        metrics.aiForecastFallbacks.increment();
        String email = SecurityUtils.getCurrentUserEmail();
        User user = userRepository.findByEmail(email).orElseThrow();
        List<Transaction> transactions = transactionRepository.findLatestThreeMonthsTransactions(user.getId());
        double income = transactions.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() > 0)
                .mapToDouble(Transaction::getAmount).sum();
        return buildFallbackForecast(transactions, income);
    }

    // =========================
    // MONTHLY HISTORY
    // No logic bugs, added null guard on rows
    // =========================

    @PreAuthorize("hasAuthority('READ_OWN_TRANSACTIONS')")
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
            if (t.getDate() == null) continue;
            String month = t.getDate().toString().substring(0, 7);
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
    // Predicts next month per category as a recency-weighted average of the
    // user's own monthly totals. Previously applied invented per-category
    // growth multipliers (Food ×1.15/month ≈ 435%/year annualized) with no
    // basis in the user's data.
    // =========================

    @PreAuthorize("hasAuthority('USE_AI_FORECAST')")
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

        // category → (month → total spent)
        Map<String, Map<java.time.YearMonth, Double>> byCategoryMonth = new HashMap<>();
        for (Transaction t : transactions) {
            if (t.getAmount() == null || t.getAmount() >= 0 || t.getDate() == null) continue;
            String cat = t.getCategory() != null ? t.getCategory() : "Other";
            byCategoryMonth
                    .computeIfAbsent(cat, k -> new HashMap<>())
                    .merge(java.time.YearMonth.from(t.getDate()),
                           Math.abs(t.getAmount()), Double::sum);
        }

        // Exclude the current, still-incomplete month from the baseline when
        // complete months exist — a half-elapsed month would drag the
        // prediction down.
        java.time.YearMonth currentMonth = java.time.YearMonth.now();

        List<CategoryForecastDTO> result = new ArrayList<>();

        byCategoryMonth.forEach((category, perMonth) -> {
            List<java.time.YearMonth> completeMonths = perMonth.keySet().stream()
                    .filter(m -> !m.equals(currentMonth))
                    .sorted()
                    .toList();

            double predicted;
            if (completeMonths.isEmpty()) {
                // Only the current partial month has data — best available
                predicted = perMonth.getOrDefault(currentMonth, 0.0);
            } else {
                // Recency-weighted average: weights 1..n oldest→newest
                double weightedSum = 0, weightTotal = 0;
                for (int i = 0; i < completeMonths.size(); i++) {
                    double w = i + 1;
                    weightedSum += perMonth.get(completeMonths.get(i)) * w;
                    weightTotal += w;
                }
                predicted = weightedSum / weightTotal;
            }

            result.add(new CategoryForecastDTO(
                    category,
                    (double) Math.round(predicted)
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

        // Average over the months actually present in the window
        int months = com.fintwin.util.TransactionMath.monthsPresent(transactions);
        double avgMonthlyExpense = expenses / months;
        double avgMonthlySavings = (income / months) - avgMonthlyExpense;

        return new ForecastDTO(
                Math.round(avgMonthlyExpense * 100.0) / 100.0,
                Math.round(avgMonthlySavings * 100.0) / 100.0,
                0.0,
                "Forecast based on your 3-month average spending."
        );
    }
}
