package com.fintwin.controller;

import com.fintwin.service.InvestmentPlanService;
import com.fintwin.util.InvestmentPlan;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/investments/plan")
public class InvestmentPlanController {

    private final InvestmentPlanService plans;

    public InvestmentPlanController(InvestmentPlanService plans) {
        this.plans = plans;
    }

    @GetMapping
    public InvestmentPlan.Result plan() {
        return plans.plan();
    }
}
