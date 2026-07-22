package com.fintwin.dto;

import java.util.List;
import java.util.Map;

/**
 * Typed snapshot of a user's aggregated financial data,
 * passed to the AI provider for context.
 */
public class FinancialSummaryDTO {

    // Lets the AI service call back into /internal/ai/{userId}/** for tool data
    private Long userId;
    private long income;
    private long expenses;
    private long savings;
    private long savingsRatio;
    private int financialScore;
    private int transactionCount;
    private String topCategory;
    private Map<String, Double> categorySpending;
    private Map<String, Double> merchantSpending;
    private List<String> budgetAlerts;
    private List<String> subscriptions;
    private List<Map<String, String>> conversationHistory;

    private FinancialSummaryDTO() {}

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private final FinancialSummaryDTO dto = new FinancialSummaryDTO();

        public Builder userId(Long v)                               { dto.userId = v;               return this; }
        public Builder income(long v)                               { dto.income = v;               return this; }
        public Builder expenses(long v)                             { dto.expenses = v;              return this; }
        public Builder savings(long v)                              { dto.savings = v;               return this; }
        public Builder savingsRatio(long v)                         { dto.savingsRatio = v;          return this; }
        public Builder financialScore(int v)                        { dto.financialScore = v;        return this; }
        public Builder transactionCount(int v)                      { dto.transactionCount = v;      return this; }
        public Builder topCategory(String v)                        { dto.topCategory = v;           return this; }
        public Builder categorySpending(Map<String, Double> v)      { dto.categorySpending = v;      return this; }
        public Builder merchantSpending(Map<String, Double> v)      { dto.merchantSpending = v;      return this; }
        public Builder budgetAlerts(List<String> v)                 { dto.budgetAlerts = v;          return this; }
        public Builder subscriptions(List<String> v)                { dto.subscriptions = v;         return this; }
        public Builder conversationHistory(List<Map<String,String>> v) { dto.conversationHistory = v; return this; }

        public FinancialSummaryDTO build() { return dto; }
    }

    public Long getUserId()                                { return userId; }
    public long getIncome()                                { return income; }
    public long getExpenses()                              { return expenses; }
    public long getSavings()                               { return savings; }
    public long getSavingsRatio()                          { return savingsRatio; }
    public int getFinancialScore()                         { return financialScore; }
    public int getTransactionCount()                       { return transactionCount; }
    public String getTopCategory()                         { return topCategory; }
    public Map<String, Double> getCategorySpending()       { return categorySpending; }
    public Map<String, Double> getMerchantSpending()       { return merchantSpending; }
    public List<String> getBudgetAlerts()                  { return budgetAlerts; }
    public List<String> getSubscriptions()                 { return subscriptions; }
    public List<Map<String, String>> getConversationHistory() { return conversationHistory; }
}
