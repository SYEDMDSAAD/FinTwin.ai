package com.fintwin.dto;

import java.util.List;

public class SpendingCoachResponseDTO {

    private String spendingHealth;

    private Double monthlyLeakage;

    private List<String> tips;

    private String coachMessage;

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
}