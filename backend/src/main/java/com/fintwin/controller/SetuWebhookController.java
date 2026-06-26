package com.fintwin.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fintwin.security.SetuJwsVerifier;
import com.fintwin.service.BankConnectionService;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Receives real-time push notifications from Setu AA.
 *
 * Authentication: Setu signs every webhook with a detached JWS
 * (x-jws-signature header). We verify it against Setu's public keys
 * fetched from their JWKS endpoint before processing the payload.
 *
 * This endpoint has no JWT auth (Setu calls it, not our users),
 * which is why the JWS check is the only gate.
 *
 * Setu sends two notification types:
 *   CONSENT_STATUS_UPDATE  — user approved/rejected consent
 *   SESSION_STATUS_UPDATE  — FI data is ready to fetch
 */
@RestController
@RequestMapping("/api/v1/bank")
public class SetuWebhookController {

    private static final Logger log = LoggerFactory.getLogger(SetuWebhookController.class);
    private static final ObjectMapper mapper = new ObjectMapper();

    private final BankConnectionService service;
    private final SetuJwsVerifier jwsVerifier;

    public SetuWebhookController(BankConnectionService service, SetuJwsVerifier jwsVerifier) {
        this.service = service;
        this.jwsVerifier = jwsVerifier;
    }

    @SuppressWarnings("unchecked")
    @PostMapping("/webhook")
    public ResponseEntity<?> handleWebhook(
            @RequestHeader(value = "x-jws-signature", required = false) String jwsSignature,
            @RequestBody byte[] rawBody) {

        if (!jwsVerifier.verify(rawBody, jwsSignature)) {
            log.warn("Setu webhook rejected — JWS signature invalid or missing");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "invalid signature"));
        }

        Map<String, Object> payload;
        try {
            payload = mapper.readValue(rawBody, new TypeReference<>() {});
        } catch (Exception e) {
            log.warn("Setu webhook — failed to parse body: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", "invalid JSON"));
        }

        String type      = payload.getOrDefault("type", "").toString();
        String consentId = strOf(payload, "consentId");

        Map<String, Object> data = (Map<String, Object>) payload.get("data");

        switch (type) {

            case "CONSENT_STATUS_UPDATE" -> {
                String status = data != null ? strOf(data, "status") : null;
                if ("ACTIVE".equals(status) && consentId != null) {
                    service.handleConsentActive(consentId, data);
                }
            }

            case "SESSION_STATUS_UPDATE" -> {
                String sessionStatus = data != null ? strOf(data, "status") : null;
                String sessionId = strOf(payload, "dataSessionId");
                if (sessionId == null) sessionId = strOf(payload, "sessionId");
                if (sessionId == null) sessionId = strOf(payload, "id");

                if ("COMPLETED".equals(sessionStatus) && sessionId != null && consentId != null) {
                    service.handleSessionCompleted(consentId, sessionId);
                }
            }

            default -> log.debug("Setu webhook: unhandled event type={}", type);
        }

        return ResponseEntity.ok(Map.of("status", "received"));
    }

    private String strOf(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v != null ? v.toString() : null;
    }
}
