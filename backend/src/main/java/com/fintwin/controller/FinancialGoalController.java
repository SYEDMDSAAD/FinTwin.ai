package com.fintwin.controller;

import com.fintwin.dto.GoalRequestDTO;
import com.fintwin.dto.FinancialGoalDTO;
import com.fintwin.service.GoalPlannerService;

import jakarta.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/goals")
public class FinancialGoalController {

    @Autowired
    private GoalPlannerService goalService;

    // =====================================
    // CREATE GOAL
    // =====================================

    @PostMapping

    public FinancialGoalDTO createGoal(

        @Valid @RequestBody
        GoalRequestDTO dto

    ) {

        return FinancialGoalDTO.from(goalService.createGoal(dto));
    }

    // =====================================
    // GET ALL GOALS
    // =====================================

    @GetMapping

    public List<FinancialGoalDTO>
    getGoals() {

        return goalService.getGoals().stream()
                .map(FinancialGoalDTO::from)
                .toList();
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

    public FinancialGoalDTO regenerateGoal(

        @PathVariable Long id

    ) {

        return FinancialGoalDTO.from(goalService.regenerateGoal(id));
    }
    // =====================================
    // MARK GOAL COMPLETE
    // =====================================

    /** "Add money": { "amount": 5000 } — negative takes some back. */
    @PostMapping("/{id}/top-up")
    public FinancialGoalDTO topUp(@PathVariable Long id, @RequestBody java.util.Map<String, Object> body) {
        Object a = body.get("amount");
        if (!(a instanceof Number n)) throw new com.fintwin.exception.BadRequestException("amount is required");
        return FinancialGoalDTO.from(goalService.topUp(id, n.doubleValue()));
    }

    @PostMapping("/{id}/complete")

    public FinancialGoalDTO completeGoal(

        @PathVariable Long id

    ) {

        return FinancialGoalDTO.from(goalService.completeGoal(id));
    }

    @PutMapping("/{id}")

    public FinancialGoalDTO updateGoal(

            @PathVariable Long id,

            @Valid @RequestBody GoalRequestDTO dto

    ) {

        return FinancialGoalDTO.from(goalService.updateGoal(id, dto));
    }
}