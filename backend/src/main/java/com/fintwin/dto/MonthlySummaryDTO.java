package com.fintwin.dto;

public class MonthlySummaryDTO {

    private double income;

    private double expenses;

    private double savings;

    private String topCategory;

    private String topMerchant;

    private int transactionCount;

    private Double incomeTrend;
    private Double expenseTrend;
    private Double savingsTrend;

    // =========================
    // Getters & Setters
    // =========================

    public double getIncome() {
        return income;
    }

    public void setIncome(double income) {
        this.income = income;
    }

    public double getExpenses() {
        return expenses;
    }

    public void setExpenses(double expenses) {
        this.expenses = expenses;
    }

    public double getSavings() {
        return savings;
    }

    public void setSavings(double savings) {
        this.savings = savings;
    }

    public String getTopCategory() {
        return topCategory;
    }

    public void setTopCategory(String topCategory) {
        this.topCategory = topCategory;
    }

    public String getTopMerchant() {
        return topMerchant;
    }

    public void setTopMerchant(String topMerchant) {
        this.topMerchant = topMerchant;
    }

    public int getTransactionCount() {
        return transactionCount;
    }

    public void setTransactionCount(int transactionCount) {
        this.transactionCount = transactionCount;
    }

    public Double getIncomeTrend() {
        return incomeTrend;
    }

    public void setIncomeTrend(Double incomeTrend) {
        this.incomeTrend = incomeTrend;
    }

    public Double getExpenseTrend() {
        return expenseTrend;
    }

    public void setExpenseTrend(Double expenseTrend) {
        this.expenseTrend = expenseTrend;
    }

    public Double getSavingsTrend() {
        return savingsTrend;
    }

    public void setSavingsTrend(Double savingsTrend) {
        this.savingsTrend = savingsTrend;
    }
}