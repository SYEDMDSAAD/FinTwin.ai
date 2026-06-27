package com.fintwin.dto;

import com.fintwin.model.FinancialGoal;

import java.time.LocalDate;

/**
 * API representation of a financial goal — mirrors the entity's serialized fields
 * (the {@code user} association was already {@code @JsonIgnore}d), keeping the JSON
 * contract identical while no longer exposing the JPA entity.
 */
public record FinancialGoalDTO(
        Long id,
        String title,
        Double targetAmount,
        Double currentSaved,
        Integer durationMonths,
        Double monthlyTarget,
        Double successProbability,
        String aiPlan,
        Double expectedSaved,
        Double progressPercent,
        Double availableSavings,
        String goalHealth,
        LocalDate createdAt
) {
    public static FinancialGoalDTO from(FinancialGoal g) {
        return new FinancialGoalDTO(
                g.getId(),
                g.getTitle(),
                g.getTargetAmount(),
                g.getCurrentSaved(),
                g.getDurationMonths(),
                g.getMonthlyTarget(),
                g.getSuccessProbability(),
                g.getAiPlan(),
                g.getExpectedSaved(),
                g.getProgressPercent(),
                g.getAvailableSavings(),
                g.getGoalHealth(),
                g.getCreatedAt()
        );
    }
}
