package com.fintwin.service;

import com.fintwin.dto.FinancialSummaryDTO;
import com.fintwin.model.ChatHistory;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
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
    private BudgetService budgetService;

    @Autowired
    private FinancialScoreService financialScoreService;

    @Autowired
    private ChatHistoryRepository chatHistoryRepository;

    public FinancialSummaryDTO aggregate(User user) {
        LocalDate cutoff = LocalDate.now().minusMonths(2).withDayOfMonth(1);
        List<Transaction> transactions =
                transactionRepository.findLatestThreeMonthsTransactions(user.getId(), cutoff);

        // Monthly averages over the months actually present — the ai-service
        // labels these "Monthly Income/Expenses/Savings" in its prompts, so
        // sending window totals had every chat answer reasoning from numbers
        // up to 3x too high.
        int months = com.fintwin.util.TransactionMath.monthsPresent(transactions);
        double income   = com.fintwin.util.TransactionMath.income(transactions) / months;
        double expenses = com.fintwin.util.TransactionMath.expenses(transactions) / months;

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
        // Single source of truth — this had its own base-50 formula, so the
        // chatbot quoted a different score than the score page.
        int    financialScore = financialScoreService.calculateScoreFor(user).getScore();

        List<String> subscriptions = merchantSpending.entrySet().stream()
                .filter(e -> transactions.stream()
                        .filter(t -> t.getAmount() != null && t.getAmount() < 0
                                && e.getKey().equals(t.getMerchant() != null ? t.getMerchant() : "Unknown"))
                        .count() >= 2)
                .map(Map.Entry::getKey)
                .toList();

        return FinancialSummaryDTO.builder()
                .userId(user.getId())
                .income(Math.round(income))
                .expenses(Math.round(expenses))
                .savings(Math.round(savings))
                .savingsRatio(Math.round(savingsRatio))
                .financialScore(financialScore)
                .transactionCount(transactions.size())
                .topCategory(topCategory)
                .categorySpending(categorySpending)
                .merchantSpending(merchantSpending)
                .budgetAlerts(computeBudgetAlerts(user))
                .subscriptions(subscriptions)
                .conversationHistory(recentHistory(user))
                .build();
    }

    // Budget alerts come from BudgetService's current-month status — the
    // previous version compared the 3-month category totals against the
    // (monthly) limit, so chat routinely reported budgets "exceeded by 200%".
    public List<String> computeBudgetAlerts(User user) {
        List<String> alerts = new ArrayList<>();
        for (com.fintwin.dto.BudgetStatusDTO status : budgetService.getBudgetStatusFor(user)) {
            if (status.getExceeded() && status.getLimit() > 0) {
                long pct = Math.round((status.getSpent() / status.getLimit()) * 100) - 100;
                alerts.add(status.getCategory() + " exceeded by " + pct + "%");
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

}
