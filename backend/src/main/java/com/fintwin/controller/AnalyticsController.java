package com.fintwin.controller;

import com.fintwin.dto.MonthlySummaryDTO;
import com.fintwin.service.AnalyticsService;
import com.fintwin.dto.RecurringExpenseDTO;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/analytics")

public class AnalyticsController {

    @Autowired
    private AnalyticsService analyticsService;

    @GetMapping("/monthly-summary")

    public MonthlySummaryDTO getMonthlySummary() {

        return analyticsService
            .getMonthlySummary();
    }

    @GetMapping("/recurring-expenses")

    public List<RecurringExpenseDTO>
    getRecurringExpenses() {

        return analyticsService
            .getRecurringExpenses();
    }
}