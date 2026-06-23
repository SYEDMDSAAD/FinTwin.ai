package com.fintwin.dto;

public class WeeklyReportDTO {

    private String summary;

    private String insights;

    private String risks;

    private String recommendations;

    private int financialScore;

    private Double netWorth;

    private Double predictedExpenses;

    private Double predictedSavings;

    private String spendingHealth;

    private String riskProfile;

    private String expectedReturn;

    private Double monthlyLeakage;

    // =========================
    // GETTERS & SETTERS
    // =========================

    public String getSummary() {

        return summary;
    }

    public void setSummary(
            String summary
    ) {

        this.summary = summary;
    }

    public String getInsights() {

        return insights;
    }

    public void setInsights(
            String insights
    ) {

        this.insights = insights;
    }

    public String getRisks() {

        return risks;
    }

    public void setRisks(
            String risks
    ) {

        this.risks = risks;
    }

    public String getRecommendations() {

        return recommendations;
    }

    public void setRecommendations(
            String recommendations
    ) {

        this.recommendations = recommendations;
    }

    public int getFinancialScore() {

        return financialScore;
    }

    public void setFinancialScore(
            int financialScore
    ) {

        this.financialScore =
            financialScore;
    }

    public Double getNetWorth() {

        return netWorth;
    }

    public void setNetWorth(
            Double netWorth
    ) {

        this.netWorth = netWorth;
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

    public String getSpendingHealth() {

        return spendingHealth;
    }

    public void setSpendingHealth(
            String spendingHealth
    ) {

        this.spendingHealth =
            spendingHealth;
    }

    public String getRiskProfile() {

        return riskProfile;
    }

    public void setRiskProfile(
            String riskProfile
    ) {

        this.riskProfile = riskProfile;
    }

    public String getExpectedReturn() {

        return expectedReturn;
    }

    public void setExpectedReturn(
            String expectedReturn
    ) {

        this.expectedReturn = expectedReturn;
    }

    public Double getMonthlyLeakage() {
        return monthlyLeakage;
    }

    public void setMonthlyLeakage(Double monthlyLeakage) {
        this.monthlyLeakage = monthlyLeakage;
    }
}