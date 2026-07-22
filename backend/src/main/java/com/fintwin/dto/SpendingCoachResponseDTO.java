package com.fintwin.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;
import java.util.Map;

/**
 * The AI service owns the shape of the coach payload. The structured blocks
 * below are passed through as maps rather than mirrored into Java types: the
 * backend never reads them, and typing them here would mean a second deploy
 * every time the analysis layer adds a field.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class SpendingCoachResponseDTO {

    private String spendingHealth;

    private Double monthlyLeakage;

    private List<String> tips;

    private String coachMessage;

    /** "ai" or "analysis" — who actually wrote coachMessage. */
    private String coachMessageSource;

    /** Findings: what is true about the user's spending. */
    private List<Map<String, Object>> insights;

    /** Actions, each with a monthly rupee impact and an effort level. */
    private List<Map<String, Object>> recommendations;

    /** How the leakage figure splits: variable, spikes, subscriptions. */
    private Map<String, Object> leakageBreakdown;

    /** Income, spend, savings rate and the category/month series behind them. */
    private Map<String, Object> snapshot;

    /** Months covered, confidence, and any caveats about the data itself. */
    private Map<String, Object> coverage;

    public String getSpendingHealth() {
        return spendingHealth;
    }

    public void setSpendingHealth(
            String spendingHealth
    ) {
        this.spendingHealth = spendingHealth;
    }

    public Double getMonthlyLeakage() {
        return monthlyLeakage;
    }

    public void setMonthlyLeakage(
            Double monthlyLeakage
    ) {
        this.monthlyLeakage = monthlyLeakage;
    }

    public List<String> getTips() {
        return tips;
    }

    public void setTips(
            List<String> tips
    ) {
        this.tips = tips;
    }

    public String getCoachMessage() {
        return coachMessage;
    }

    public void setCoachMessage(
            String coachMessage
    ) {
        this.coachMessage = coachMessage;
    }

    public String getCoachMessageSource() {
        return coachMessageSource;
    }

    public void setCoachMessageSource(
            String coachMessageSource
    ) {
        this.coachMessageSource = coachMessageSource;
    }

    public List<Map<String, Object>> getInsights() {
        return insights;
    }

    public void setInsights(
            List<Map<String, Object>> insights
    ) {
        this.insights = insights;
    }

    public List<Map<String, Object>> getRecommendations() {
        return recommendations;
    }

    public void setRecommendations(
            List<Map<String, Object>> recommendations
    ) {
        this.recommendations = recommendations;
    }

    public Map<String, Object> getLeakageBreakdown() {
        return leakageBreakdown;
    }

    public void setLeakageBreakdown(
            Map<String, Object> leakageBreakdown
    ) {
        this.leakageBreakdown = leakageBreakdown;
    }

    public Map<String, Object> getSnapshot() {
        return snapshot;
    }

    public void setSnapshot(
            Map<String, Object> snapshot
    ) {
        this.snapshot = snapshot;
    }

    public Map<String, Object> getCoverage() {
        return coverage;
    }

    public void setCoverage(
            Map<String, Object> coverage
    ) {
        this.coverage = coverage;
    }
}
