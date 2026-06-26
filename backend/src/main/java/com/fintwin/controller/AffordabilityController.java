package com.fintwin.controller;

import com.fintwin.service.AffordabilityService;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/affordability")
public class AffordabilityController {

    @Autowired
    private AffordabilityService service;

    @GetMapping
    public Map<String, Object> analyze(
            @RequestParam Double price
    ) {

        return service.analyzePurchase(price);
    }
}