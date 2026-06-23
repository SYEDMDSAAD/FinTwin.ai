package com.fintwin.dto;

import java.util.List;

public class InvestmentRecommendationDTO {

    private String riskProfile;

    private String summary;

    private List<?> recommendations;

    public String getRiskProfile() {
        return riskProfile;
    }

    public void setRiskProfile(String riskProfile) {
        this.riskProfile = riskProfile;
    }

    public String getSummary() {
        return summary;
    }

    public void setSummary(String summary) {
        this.summary = summary;
    }

    public List<?> getRecommendations() {
        return recommendations;
    }

    public void setRecommendations(
            List<?> recommendations
    ) {
        this.recommendations =
                recommendations;
    }
}