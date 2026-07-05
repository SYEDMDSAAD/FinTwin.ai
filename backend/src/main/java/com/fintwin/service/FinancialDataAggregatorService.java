package com.fintwin.service;

import com.fintwin.dto.FinancialSummaryDTO;
import com.fintwin.model.Budget;
import com.fintwin.model.ChatHistory;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.BudgetRepository;
import com.fintwin.repository.ChatHistoryRepository;
import com.fintwin.repository.TransactionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;

/**
 * Single source of truth for computing a user's financial snapshot.
 * Used by ChatService (and any future AI feature) to get consistent metrics.
 */
@Service
public class FinancialDataAggregatorService {

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private BudgetRepository budgetRepository;

    @Autowired
    private ChatHistoryRepository chatHistoryRepository;

    public FinancialSummaryDTO aggregate(User user) {
        LocalDate cutoff = LocalDate.now().minusMonths(2).withDayOfMonth(1);
        List<Transaction> transactions =
                transactionRepository.findLatestThreeMonthsTransactions(user.getId(), cutoff);

        double income   = transactions.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() > 0)
                .mapToDouble(Transaction::getAmount)
                .sum();

        double expenses = transactions.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() < 0)
                .mapToDouble(t -> Math.abs(t.getAmount()))
                .sum();

        double savings = income - expenses;

        Map<String, Double> categorySpending = new HashMap<>();
        Map<String, Double> merchantSpending = new HashMap<>();

        for (Transaction t : transactions) {
            if (t.getAmount() != null && t.getAmount() < 0) {
                String cat   = t.getCategory() != null ? t.getCategory() : "Other";
                String merch = t.getMerchant() != null ? t.getMerchant() : "Unknown";
                categorySpending.merge(cat,   Math.abs(t.getAmount()), Double::sum);
                merchantSpending.merge(merch, Math.abs(t.getAmount()), Double::sum);
            }
        }

        String topCategory = categorySpending.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse("Unknown");

        double savingsRatio = income > 0 ? (savings / income) * 100 : 0;
        int    financialScore = computeScore(savingsRatio, expenses, income);

        List<String> subscriptions = merchantSpending.entrySet().stream()
                .filter(e -> transactions.stream()
                        .filter(t -> t.getAmount() != null && t.getAmount() < 0
                                && e.getKey().equals(t.getMerchant() != null ? t.getMerchant() : "Unknown"))
                        .count() >= 2)
                .map(Map.Entry::getKey)
                .toList();

        return FinancialSummaryDTO.builder()
                .income(Math.round(income))
                .expenses(Math.round(expenses))
                .savings(Math.round(savings))
                .savingsRatio(Math.round(savingsRatio))
                .financialScore(financialScore)
                .transactionCount(transactions.size())
                .topCategory(topCategory)
                .categorySpending(categorySpending)
                .merchantSpending(merchantSpending)
                .budgetAlerts(computeBudgetAlerts(user, categorySpending))
                .subscriptions(subscriptions)
                .conversationHistory(recentHistory(user))
                .build();
    }

    public List<String> computeBudgetAlerts(User user, Map<String, Double> categorySpending) {
        List<String> alerts = new ArrayList<>();
        for (Budget b : budgetRepository.findByUser(user)) {
            double spent = categorySpending.getOrDefault(b.getCategory(), 0.0);
            if (b.getLimitAmount() != null && spent > b.getLimitAmount()) {
                long pct = Math.round((spent / b.getLimitAmount()) * 100) - 100;
                alerts.add(b.getCategory() + " exceeded by " + pct + "%");
            }
        }
        return alerts;
    }

    private List<Map<String, String>> recentHistory(User user) {
        List<ChatHistory> history =
                chatHistoryRepository.findTop10ByUserOrderByTimestampDesc(user);
        Collections.reverse(history);
        List<Map<String, String>> result = new ArrayList<>();
        for (ChatHistory chat : history) {
            Map<String, String> item = new HashMap<>();
            item.put("message", chat.getMessage());
            item.put("reply",   chat.getReply());
            result.add(item);
        }
        return result;
    }

    private int computeScore(double savingsRatio, double expenses, double income) {
        int score = 50;
        if (savingsRatio >= 40) score += 30;
        else if (savingsRatio >= 20) score += 15;
        if (expenses > income * 0.8) score -= 15;
        return Math.max(0, Math.min(100, score));
    }
}
