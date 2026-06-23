package com.fintwin.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public class GoalRequestDTO {

    @NotBlank(message = "Goal title is required")
    @Size(min = 2, max = 100, message = "Title must be between 2 and 100 characters")
    private String title;

    @NotNull(message = "Target amount is required")
    @Positive(message = "Target amount must be greater than 0")
    private Double targetAmount;

    @NotNull(message = "Duration is required")
    @Min(value = 1, message = "Duration must be at least 1 month")
    private Integer durationMonths;

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public Double getTargetAmount() { return targetAmount; }
    public void setTargetAmount(Double targetAmount) { this.targetAmount = targetAmount; }
    public Integer getDurationMonths() { return durationMonths; }
    public void setDurationMonths(Integer durationMonths) { this.durationMonths = durationMonths; }
}
