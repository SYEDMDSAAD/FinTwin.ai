package com.fintwin.controller;

import com.fintwin.service.InboundEmailService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Receives bank alert emails from our inbound mail worker. Not called by
 * browsers and carries no JWT: the worker signs every call with a shared
 * secret (see InboundEmailService), and the status code tells it whether to
 * redeliver.
 */
@RestController
@RequestMapping("/api/v1/inbound")
public class InboundEmailController {

    private final InboundEmailService service;

    public InboundEmailController(InboundEmailService service) {
        this.service = service;
    }

    @PostMapping("/email")
    public ResponseEntity<Map<String, String>> receive(
            @RequestBody byte[] body,
            @RequestHeader(value = "X-FinTwin-Timestamp", required = false) String timestamp,
            @RequestHeader(value = "X-FinTwin-Signature", required = false) String signature) {
        return switch (service.receive(body, timestamp, signature)) {
            case ACCEPTED -> ResponseEntity.ok(Map.of("status", "accepted"));
            case UNAUTHORIZED -> ResponseEntity.status(401).body(Map.of("status", "unauthorized"));
            case RETRY -> ResponseEntity.status(503).body(Map.of("status", "retry"));
        };
    }
}
