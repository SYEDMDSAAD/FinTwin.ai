package com.fintwin.controller;

import com.fintwin.dto.GoalRequestDTO;
import com.fintwin.model.FinancialGoal;
import com.fintwin.service.GoalPlannerService;

import jakarta.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/goals")
public class FinancialGoalController {

    @Autowired
    private GoalPlannerService goalService;

    // =====================================
    // CREATE GOAL
    // =====================================

    @PostMapping

    public FinancialGoal createGoal(

        @Valid @RequestBody
        GoalRequestDTO dto

    ) {

        return goalService.createGoal(
            dto
        );
    }

    // =====================================
    // GET ALL GOALS
    // =====================================

    @GetMapping

    public List<FinancialGoal>
    getGoals() {

        return goalService.getGoals();
    }

    // =====================================
    // DELETE GOAL
    // =====================================

    @DeleteMapping("/{id}")

    public ResponseEntity<?> deleteGoal(

        @PathVariable Long id

    ) {

        goalService.deleteGoal(id);

        return ResponseEntity.ok(

            Map.of(
                "success",
                true
            )
        );
    }

    // =====================================
    // REGENERATE AI PLAN
    // =====================================

    @PostMapping("/{id}/regenerate")

    public FinancialGoal regenerateGoal(

        @PathVariable Long id

    ) {

        return goalService.regenerateGoal(
            id
        );
    }
    @PutMapping("/{id}")

    public FinancialGoal updateGoal(

            @PathVariable Long id,

            @Valid @RequestBody GoalRequestDTO dto

    ) {

        return goalService.updateGoal(
                id,
                dto
        );
    }
}