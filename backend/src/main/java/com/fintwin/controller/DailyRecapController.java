package com.fintwin.controller;

import com.fintwin.dto.DailyRecapDTO;
import com.fintwin.service.DailyRecapService;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/daily-recap")
public class DailyRecapController {

    private final DailyRecapService dailyRecapService;

    public DailyRecapController(DailyRecapService dailyRecapService) {
        this.dailyRecapService = dailyRecapService;
    }

    @GetMapping
    public DailyRecapDTO getRecap() {
        return dailyRecapService.getRecap();
    }

    /**
     * Separate from the GET on purpose: fetching the recap must not consume it,
     * or a refresh would blank the page the user just opened.
     */
    @PostMapping("/seen")
    public ResponseEntity<Void> markSeen() {
        dailyRecapService.markSeen();
        return ResponseEntity.noContent().build();
    }
}
