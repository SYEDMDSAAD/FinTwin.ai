package com.fintwin.controller;

import com.fintwin.service
        .InvestmentRecommendationService;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping(
        "/api/v1/investments"
)
public class InvestmentRecommendationController {

    @Autowired
    private InvestmentRecommendationService
            service;

    @GetMapping
    public Map<String,Object>
    getRecommendations() {

        return service.getRecommendation();
    }
}