package com.fintwin.dto;

public class MonthlyExpenseDTO {

    private String month;

    private Double expense;

    public MonthlyExpenseDTO(
            String month,
            Double expense
    ) {
        this.month = month;
        this.expense = expense;
    }

    public String getMonth() {
        return month;
    }

    public Double getExpense() {
        return expense;
    }
}