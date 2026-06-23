package com.fintwin.controller;

import com.fintwin.dto.BudgetStatusDTO;

import com.fintwin.model.Budget;

import com.fintwin.service.BudgetService;

import org.springframework.web.bind.annotation.*;

import org.springframework.http.ResponseEntity;

import java.util.List;

@RestController

@RequestMapping("/api/budgets")


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

    public Budget createBudget(

        @RequestBody Budget budget

    ) {

        return budgetService
            .createBudget(budget);
    }

    // =========================
    // Budget Status
    // =========================

    @GetMapping("/status")

    public List<BudgetStatusDTO>
    getBudgetStatus() {

        return budgetService
            .getBudgetStatus();
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