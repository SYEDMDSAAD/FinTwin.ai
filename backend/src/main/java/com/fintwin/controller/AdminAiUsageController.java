package com.fintwin.controller;

import com.fintwin.service.AiTokenUsageService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Model tokens used per user and per AI feature, for the admin page's AI
 * Usage tab. Names users (email, full name), so it takes READ_ALL_USERS on
 * top of the ADMIN role every /api/v1/admin route requires.
 */
@RestController
@RequestMapping("/api/v1/admin/ai-usage")
@PreAuthorize("hasAuthority('READ_ALL_USERS')")
public class AdminAiUsageController {

    private final AiTokenUsageService usage;

    public AdminAiUsageController(AiTokenUsageService usage) {
        this.usage = usage;
    }

    @GetMapping
    public AiTokenUsageService.Summary summary(
            @RequestParam(defaultValue = "30")  int days,
            @RequestParam(defaultValue = "100") int limit) {
        return usage.summary(Math.max(1, Math.min(days, 365)), Math.max(1, Math.min(limit, 500)));
    }
}
