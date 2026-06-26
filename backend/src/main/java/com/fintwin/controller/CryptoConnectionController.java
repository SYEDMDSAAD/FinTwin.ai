package com.fintwin.controller;

import com.fintwin.dto.CryptoConnectionDTO;
import com.fintwin.service.CryptoConnectionService;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/crypto")
public class CryptoConnectionController {

    private final CryptoConnectionService service;

    public CryptoConnectionController(CryptoConnectionService service) {
        this.service = service;
    }

    // List all connected exchanges (no credentials returned)
    @GetMapping("/connections")
    public ResponseEntity<List<CryptoConnectionDTO>> list() {
        return ResponseEntity.ok(service.list());
    }

    // Connect a new exchange — user provides their exchange API key + secret
    // Body: { "exchange": "Binance", "apiKey": "...", "apiSecret": "..." }
    @PostMapping("/connect")
    public ResponseEntity<CryptoConnectionDTO> connect(@RequestBody Map<String, String> body) {
        String exchange  = body.get("exchange");
        String apiKey    = body.get("apiKey");
        String apiSecret = body.get("apiSecret");
        if (exchange == null || apiKey == null || apiSecret == null)
            return ResponseEntity.badRequest().build();
        return ResponseEntity.ok(service.connect(exchange, apiKey, apiSecret));
    }

    // Trigger manual re-sync for a specific connection
    @PostMapping("/resync/{id}")
    public ResponseEntity<CryptoConnectionDTO> resync(@PathVariable Long id) {
        return ResponseEntity.ok(service.resync(id));
    }

    // Remove a connection
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> disconnect(@PathVariable Long id) {
        service.disconnect(id);
        return ResponseEntity.noContent().build();
    }
}
