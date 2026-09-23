package com.fintwin.dto;

import java.time.Instant;
import java.util.List;

public class WeeklyReportDTO {

    private String summary;

    private List<ReportItemDTO> insights;

    private List<ReportItemDTO> risks;

    private List<ReportItemDTO> recommendations;

    private List<ReportTrendDTO> trends;

    private int financialScore;

    private Double netWorth;

    private Double savingsRate;

    /** Trailing-average projection for next month, not a forecast model. */
    private Double predictedExpenses;

    private Double predictedSavings;

    private String spendingHealth;

    private Double monthlyLeakage;

    /**
     * True when any section fell back to computed prose because the AI was
     * unavailable or its figures failed grounding. The UI says so rather than
     * presenting template text as analysis.
     */
    private boolean degraded;

    /** When this report was generated, so the UI can show staleness honestly. */
    private Instant generatedAt;

    /** The months compared in {@link #trends}, e.g. "May vs April 2026". */
    private String comparisonPeriod;

    // =========================
    // GETTERS & SETTERS
    // =========================

    public String getSummary()              { return summary; }
    public void setSummary(String summary)  { this.summary = summary; }

    public List<ReportItemDTO> getInsights()             { return insights; }
    public void setInsights(List<ReportItemDTO> items)   { this.insights = items; }

    public List<ReportItemDTO> getRisks()                { return risks; }
    public void setRisks(List<ReportItemDTO> items)      { this.risks = items; }

    public List<ReportItemDTO> getRecommendations()            { return recommendations; }
    public void setRecommendations(List<ReportItemDTO> items)  { this.recommendations = items; }

    public List<ReportTrendDTO> getTrends()               { return trends; }
    public void setTrends(List<ReportTrendDTO> trends)    { this.trends = trends; }

    public int getFinancialScore()                  { return financialScore; }
    public void setFinancialScore(int score)        { this.financialScore = score; }

    public Double getNetWorth()                 { return netWorth; }
    public void setNetWorth(Double netWorth)    { this.netWorth = netWorth; }

    public Double getSavingsRate()                  { return savingsRate; }
    public void setSavingsRate(Double savingsRate)  { this.savingsRate = savingsRate; }

    public Double getPredictedExpenses()            { return predictedExpenses; }
    public void setPredictedExpenses(Double v)      { this.predictedExpenses = v; }

    public Double getPredictedSavings()             { return predictedSavings; }
    public void setPredictedSavings(Double v)       { this.predictedSavings = v; }

    public String getSpendingHealth()               { return spendingHealth; }
    public void setSpendingHealth(String v)         { this.spendingHealth = v; }

    public Double getMonthlyLeakage()               { return monthlyLeakage; }
    public void setMonthlyLeakage(Double v)         { this.monthlyLeakage = v; }

    public boolean isDegraded()                 { return degraded; }
    public void setDegraded(boolean degraded)   { this.degraded = degraded; }

    public Instant getGeneratedAt()                 { return generatedAt; }
    public void setGeneratedAt(Instant generatedAt) { this.generatedAt = generatedAt; }

    public String getComparisonPeriod()             { return comparisonPeriod; }
    public void setComparisonPeriod(String v)       { this.comparisonPeriod = v; }
}
