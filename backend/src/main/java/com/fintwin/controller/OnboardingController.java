package com.fintwin.controller;

import com.fintwin.dto.OnboardingRequestDTO;

import com.fintwin.service.OnboardingService;

import org.springframework.http.ResponseEntity;

import org.springframework.web.bind.annotation.*;

@RestController

@RequestMapping("/api/v1/onboarding")


public class OnboardingController {

    private final OnboardingService
        onboardingService;

    public OnboardingController(

        OnboardingService onboardingService

    ) {

        this.onboardingService =
            onboardingService;
    }

    @PostMapping("/complete")

    public ResponseEntity<String>
    completeOnboarding(

        @RequestBody
        OnboardingRequestDTO request

    ) {

        onboardingService
            .completeSetup(request);

        return ResponseEntity.ok(

            "Onboarding completed successfully"
        );
    }
}