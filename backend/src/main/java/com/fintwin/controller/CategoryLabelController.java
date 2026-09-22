package com.fintwin.controller;

import com.fintwin.exception.BadRequestException;
import com.fintwin.service.CategoryLabelService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
public class CategoryLabelController {

    private final CategoryLabelService service;
    private final com.fintwin.service.ChatService chatService;
    private final com.fintwin.service.AnomalyService anomalyService;

    public CategoryLabelController(CategoryLabelService service, com.fintwin.service.ChatService chatService,
                                   com.fintwin.service.AnomalyService anomalyService) {
        this.service = service;
        this.chatService = chatService;
        this.anomalyService = anomalyService;
    }

    /** Admin: confirmed alerts versus false alarms, per kind of anomaly alert. */
    @GetMapping("/api/v1/admin/anomalies/feedback-stats")
    public Map<String, Object> anomalyFeedback() {
        return anomalyService.feedbackStats();
    }

    /** Admin: how users rate copilot answers, by the path that produced them. */
    @GetMapping("/api/v1/admin/copilot/feedback-stats")
    public Map<String, Object> copilotFeedback() {
        return chatService.feedbackStats();
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
