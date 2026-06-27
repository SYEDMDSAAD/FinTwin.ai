package com.fintwin.dto;

import com.fintwin.model.Budget;

/** API representation of a budget — mirrors the entity's serialized fields (user excluded). */
public record BudgetDTO(Long id, String category, Double limitAmount) {

    public static BudgetDTO from(Budget b) {
        return new BudgetDTO(b.getId(), b.getCategory(), b.getLimitAmount());
    }
}
