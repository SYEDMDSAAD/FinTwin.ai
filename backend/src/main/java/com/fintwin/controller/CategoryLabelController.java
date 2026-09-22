package com.fintwin.controller;

import com.fintwin.exception.BadRequestException;
import com.fintwin.service.CategoryLabelService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
public class CategoryLabelController {

    private final CategoryLabelService service;

    public CategoryLabelController(CategoryLabelService service) {
        this.service = service;
    }

    /** Whether the user lets FinTwin use their anonymised transactions to improve categorisation. */
    @GetMapping("/api/v1/profile/training-consent")
    public Map<String, Object> consent() {
        return service.consent();
    }

    @PutMapping("/api/v1/profile/training-consent")
    public Map<String, Object> setConsent(@RequestBody Map<String, Object> body) {
        if (!(body.get("given") instanceof Boolean given))
            throw new BadRequestException("'given' must be true or false");
        return service.setConsent(given);
    }

    /** Admin: how often users correct each categorisation method. */
    @GetMapping("/api/v1/admin/categorization/stats")
    public Map<String, Object> stats() {
        return service.stats();
    }
}
