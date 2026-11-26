package com.fintwin.controller;

import com.fintwin.service.PlanDraftService;
import com.fintwin.util.PlanDraftMath;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** A plan drafted from the user's own transactions; see {@link PlanDraftService}. */
@RestController
@RequestMapping("/api/v1/plan")
public class PlanController {

    private final PlanDraftService service;

    public PlanController(PlanDraftService service) {
        this.service = service;
    }

    public record ApplyRequest(List<PlanDraftService.ApprovedLine> budgets) {}

    @GetMapping("/draft")
    public PlanDraftMath.Draft draft() {
        return service.draft();
    }

    @PostMapping("/budgets")
    public PlanDraftService.Applied apply(@RequestBody ApplyRequest request) {
        return service.apply(request == null ? null : request.budgets());
    }
}
