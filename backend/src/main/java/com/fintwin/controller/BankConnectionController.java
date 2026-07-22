package com.fintwin.controller;

import com.fintwin.dto.BankConnectionDTO;
import com.fintwin.service.BankConnectionService;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/bank")
public class BankConnectionController {

    private final BankConnectionService service;

    public BankConnectionController(BankConnectionService service) {
        this.service = service;
    }

    // Initiate consent flow — returns Setu redirect URL
    @PostMapping("/connect")
    public ResponseEntity<Map<String, Object>> connect(
            @RequestBody(required = false) Map<String, String> body) {
        try {
            String vua = body != null ? body.get("vua") : null;
            return ResponseEntity.ok(service.initiateConnection(vua));
        } catch (RuntimeException e) {
            String msg = e.getMessage() != null ? e.getMessage() : "Bank connection failed";
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", msg));
        }
    }

    // List all bank connections for the current user — returns DTO (no consentId/consentHandle)
    @GetMapping("/connections")
    public List<BankConnectionDTO> getConnections() {
        return service.getConnections().stream()
                .map(BankConnectionDTO::new)
                .toList();
    }

    // Manually recover PENDING connections whose webhook was missed
    @PostMapping("/sync")
    public ResponseEntity<Map<String, String>> sync() {
        String result = service.syncPendingConnections();
        return ResponseEntity.ok(Map.of("message", result));
    }

    // Force re-fetch FI data for a specific connection (works for ACTIVE too)
    @PostMapping("/resync/{id}")
    public ResponseEntity<Map<String, String>> resync(@PathVariable Long id) {
        String result = service.forceResync(id);
        return ResponseEntity.ok(Map.of("message", result));
    }

    // Replace an expired/unusable connection with a fresh consent in one step —
    // no separate disconnect click needed, transaction history is unaffected
    @PostMapping("/refresh/{id}")
    public ResponseEntity<Map<String, Object>> refresh(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> body) {
        try {
            String vua = body != null ? body.get("vua") : null;
            return ResponseEntity.ok(service.refreshConnection(id, vua));
        } catch (RuntimeException e) {
            String msg = e.getMessage() != null ? e.getMessage() : "Bank connection refresh failed";
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", msg));
        }
    }

    // Revoke / disconnect a bank connection
    @DeleteMapping("/{id}")
    public ResponseEntity<?> disconnect(@PathVariable Long id) {
        service.disconnect(id);
        return ResponseEntity.ok(Map.of("success", true));
    }
}
