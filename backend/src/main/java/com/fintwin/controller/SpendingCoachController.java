package com.fintwin.controller;

import com.fintwin.dto.SpendingCoachResponseDTO;
import com.fintwin.service.SpendingCoachService;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping(
        "/api/v1/spending-coach"
)
public class SpendingCoachController {

    @Autowired
    private SpendingCoachService
            spendingCoachService;

    @GetMapping
    public SpendingCoachResponseDTO
    getCoachInsights() {

        return spendingCoachService
                .getCoachInsights();
    }
}