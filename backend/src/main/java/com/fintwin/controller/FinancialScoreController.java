package com.fintwin.controller;

import com.fintwin.dto.FinancialScoreDTO;

import com.fintwin.service
    .FinancialScoreService;

import org.springframework.web.bind.annotation.*;

@RestController

@RequestMapping("/api/financial-score")


public class FinancialScoreController {

    private final FinancialScoreService
        financialScoreService;

    public FinancialScoreController(

        FinancialScoreService
            financialScoreService

    ) {

        this.financialScoreService =
            financialScoreService;
    }

    @GetMapping

    public FinancialScoreDTO
    getScore() {

        return financialScoreService
            .calculateScore();
    }
}