package com.fintwin.controller;

import com.fintwin.service.InsightService;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/insights")
public class InsightController {

    @Autowired
    private InsightService insightService;

    @GetMapping
    public List<String> getInsights() {

        return insightService.generateInsights();
    }
}