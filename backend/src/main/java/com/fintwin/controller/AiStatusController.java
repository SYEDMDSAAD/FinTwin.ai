package com.fintwin.controller;

import com.fintwin.service.AiStatusService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Whether FinTwin AI is answering right now. Any signed-in user may ask: the
 * app uses it to show the copilot as offline instead of letting a question fail.
 */
@RestController
@RequestMapping("/api/v1/ai/status")
public class AiStatusController {

    private final AiStatusService status;

    public AiStatusController(AiStatusService status) {
        this.status = status;
    }

    @GetMapping
    public AiStatusService.Status status() {
        return status.current();
    }
}
