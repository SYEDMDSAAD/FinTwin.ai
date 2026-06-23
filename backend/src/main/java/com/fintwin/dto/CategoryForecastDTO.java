package com.fintwin.dto;

public class CategoryForecastDTO {

    private String category;

    private Double predictedAmount;

    public CategoryForecastDTO(
            String category,
            Double predictedAmount
    ) {
        this.category = category;
        this.predictedAmount = predictedAmount;
    }

    public String getCategory() {
        return category;
    }

    public Double getPredictedAmount() {
        return predictedAmount;
    }
}