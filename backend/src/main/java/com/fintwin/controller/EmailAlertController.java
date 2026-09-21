package com.fintwin.controller;

import com.fintwin.service.EmailAlertSettingsService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/email-alerts")
public class EmailAlertController {

    private final EmailAlertSettingsService service;

    public EmailAlertController(EmailAlertSettingsService service) {
        this.service = service;
    }

    /** The user's forwarding address, Gmail's confirmation code, recent alerts. */
    @GetMapping
    public Map<String, Object> status() {
        return service.status();
    }

    /** Replace the forwarding address, e.g. after it was shared by mistake. */
    @PostMapping("/rotate")
    public Map<String, Object> rotate() {
        return service.rotate();
    }
}
