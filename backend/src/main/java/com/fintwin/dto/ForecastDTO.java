package com.fintwin.dto;

public class ForecastDTO {

    private Double predictedExpenses;

    private Double predictedSavings;

    private Double expenseGrowth;

    private String insight;

    public ForecastDTO() {
    }

    public ForecastDTO(
        Double predictedExpenses,
        Double predictedSavings,
        Double expenseGrowth,
        String insight
    ) {

        this.predictedExpenses =
            predictedExpenses;

        this.predictedSavings =
            predictedSavings;

        this.expenseGrowth =
            expenseGrowth;

        this.insight =
            insight;
    }

    public Double getPredictedExpenses() {
        return predictedExpenses;
    }

    public void setPredictedExpenses(
        Double predictedExpenses
    ) {
        this.predictedExpenses =
            predictedExpenses;
    }

    public Double getPredictedSavings() {
        return predictedSavings;
    }

    public void setPredictedSavings(
        Double predictedSavings
    ) {
        this.predictedSavings =
            predictedSavings;
    }

    public Double getExpenseGrowth() {
        return expenseGrowth;
    }

    public void setExpenseGrowth(
        Double expenseGrowth
    ) {
        this.expenseGrowth =
            expenseGrowth;
    }

    public String getInsight() {
        return insight;
    }

    public void setInsight(
        String insight
    ) {
        this.insight = insight;
    }
}