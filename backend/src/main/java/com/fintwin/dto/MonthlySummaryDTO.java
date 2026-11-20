package com.fintwin.dto;

import java.time.LocalDate;

/**
 * The dashboard's money figures. Each group covers its own period, named in its
 * fields so the screen can say which one it shows:
 * income/expenses/savings from periodFrom (the last 3 months), month* for this
 * month so far, compared* for the same days of last month, allTime* since the
 * first transaction on record.
 */
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

    private LocalDate periodFrom;
    private LocalDate monthFrom;
    private double monthIncome;
    private double monthExpenses;
    private double monthSavings;
    private LocalDate comparedFrom;
    private LocalDate comparedTo;
    private double comparedIncome;
    private double comparedExpenses;
    private double comparedSavings;
    private LocalDate allTimeFrom;
    private double allTimeIncome;
    private double allTimeExpenses;
    private double allTimeSavings;

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

    public LocalDate getPeriodFrom() {
        return periodFrom;
    }

    public void setPeriodFrom(LocalDate periodFrom) {
        this.periodFrom = periodFrom;
    }

    public LocalDate getMonthFrom() {
        return monthFrom;
    }

    public void setMonthFrom(LocalDate monthFrom) {
        this.monthFrom = monthFrom;
    }

    public double getMonthIncome() {
        return monthIncome;
    }

    public void setMonthIncome(double monthIncome) {
        this.monthIncome = monthIncome;
    }

    public double getMonthExpenses() {
        return monthExpenses;
    }

    public void setMonthExpenses(double monthExpenses) {
        this.monthExpenses = monthExpenses;
    }

    public double getMonthSavings() {
        return monthSavings;
    }

    public void setMonthSavings(double monthSavings) {
        this.monthSavings = monthSavings;
    }

    public LocalDate getComparedFrom() {
        return comparedFrom;
    }

    public void setComparedFrom(LocalDate comparedFrom) {
        this.comparedFrom = comparedFrom;
    }

    public LocalDate getComparedTo() {
        return comparedTo;
    }

    public void setComparedTo(LocalDate comparedTo) {
        this.comparedTo = comparedTo;
    }

    public double getComparedIncome() {
        return comparedIncome;
    }

    public void setComparedIncome(double comparedIncome) {
        this.comparedIncome = comparedIncome;
    }

    public double getComparedExpenses() {
        return comparedExpenses;
    }

    public void setComparedExpenses(double comparedExpenses) {
        this.comparedExpenses = comparedExpenses;
    }

    public double getComparedSavings() {
        return comparedSavings;
    }

    public void setComparedSavings(double comparedSavings) {
        this.comparedSavings = comparedSavings;
    }

    public LocalDate getAllTimeFrom() {
        return allTimeFrom;
    }

    public void setAllTimeFrom(LocalDate allTimeFrom) {
        this.allTimeFrom = allTimeFrom;
    }

    public double getAllTimeIncome() {
        return allTimeIncome;
    }

    public void setAllTimeIncome(double allTimeIncome) {
        this.allTimeIncome = allTimeIncome;
    }

    public double getAllTimeExpenses() {
        return allTimeExpenses;
    }

    public void setAllTimeExpenses(double allTimeExpenses) {
        this.allTimeExpenses = allTimeExpenses;
    }

    public double getAllTimeSavings() {
        return allTimeSavings;
    }

    public void setAllTimeSavings(double allTimeSavings) {
        this.allTimeSavings = allTimeSavings;
    }
}
