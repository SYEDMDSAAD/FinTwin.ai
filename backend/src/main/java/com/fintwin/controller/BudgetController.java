package com.fintwin.controller;

import com.fintwin.dto.BudgetStatusDTO;
import com.fintwin.dto.BudgetDTO;

import com.fintwin.model.Budget;

import com.fintwin.service.BudgetService;

import org.springframework.web.bind.annotation.*;

import org.springframework.http.ResponseEntity;

import java.util.List;

@RestController

@RequestMapping("/api/v1/budgets")


public class BudgetController {

    private final BudgetService budgetService;

    public BudgetController(
        BudgetService budgetService
    ) {

        this.budgetService =
            budgetService;
    }

    // =========================
    // Create Budget
    // =========================

    @PostMapping

    public BudgetDTO createBudget(

        @RequestBody Budget budget

    ) {

        return BudgetDTO.from(
            budgetService.createBudget(budget));
    }

    // =========================
    // Update Budget (limit only)
    // =========================

    @PutMapping("/{id}")

    public BudgetDTO updateBudget(

        @PathVariable
        Long id,

        @RequestBody Budget budget

    ) {

        return BudgetDTO.from(
            budgetService.updateBudget(
                id, budget.getLimitAmount()));
    }

    // =========================
    // Budget Status
    // month is optional (yyyy-MM); omitted = current month. Past months are
    // computed on demand from transactions against the current limits.
    // =========================

    @GetMapping("/status")

    public List<BudgetStatusDTO>
    getBudgetStatus(

        @RequestParam(required = false)
        String month

    ) {

        java.time.YearMonth parsed = null;

        if (month != null && !month.isBlank()) {
            try {
                parsed = java.time.YearMonth.parse(month);
            } catch (java.time.format.DateTimeParseException e) {
                throw new IllegalArgumentException(
                    "month must be in yyyy-MM format"
                );
            }
        }

        return budgetService
            .getBudgetStatus(parsed);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteBudget(

            @PathVariable
            Long id

    ) {

        budgetService.deleteBudget(id);

        return ResponseEntity.ok(
            "Budget Deleted"
        );
    }
}