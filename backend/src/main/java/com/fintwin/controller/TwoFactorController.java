package com.fintwin.controller;

import com.fintwin.service.TwoFactorService;
import io.jsonwebtoken.ExpiredJwtException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class TwoFactorController {

    @Autowired
    private TwoFactorService twoFactorService;

    @GetMapping("/2fa/status")
    public ResponseEntity<?> getStatus(Principal principal) {
        return ResponseEntity.ok(Map.of("enabled", twoFactorService.isEnabled(principal.getName())));
    }

    @PostMapping("/2fa/setup")
    public ResponseEntity<?> setup(Principal principal) {
        try {
            return ResponseEntity.ok(twoFactorService.setup(principal.getName()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/2fa/enable")
    public ResponseEntity<?> enable(Principal principal, @RequestBody Map<String, String> body) {
        try {
            int code = Integer.parseInt(body.getOrDefault("code", "0").replaceAll("\\s", ""));
            twoFactorService.enable(principal.getName(), code);
            return ResponseEntity.ok(Map.of("message", "Two-factor authentication enabled"));
        } catch (NumberFormatException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid code format"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/2fa/disable")
    public ResponseEntity<?> disable(Principal principal, @RequestBody Map<String, String> body) {
        try {
            int code = Integer.parseInt(body.getOrDefault("code", "0").replaceAll("\\s", ""));
            twoFactorService.disable(principal.getName(), code);
            return ResponseEntity.ok(Map.of("message", "Two-factor authentication disabled"));
        } catch (NumberFormatException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid code format"));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/2fa/debug")
    public ResponseEntity<?> debug(Principal principal) {
        try {
            return ResponseEntity.ok(twoFactorService.getDebugInfo(principal.getName()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/auth/2fa/login")
    public ResponseEntity<?> twoFactorLogin(@RequestBody Map<String, String> body) {
        try {
            String tempToken = body.get("twoFactorToken");
            String codeStr   = body.getOrDefault("code", "");
            if (tempToken == null || tempToken.isBlank())
                return ResponseEntity.badRequest().body(Map.of("error", "Missing temp token"));
            return ResponseEntity.ok(twoFactorService.completeTwoFactorLogin(tempToken, codeStr));
        } catch (NumberFormatException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Code must be 6 digits"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(401).body(Map.of("error", "Invalid token type"));
        } catch (SecurityException e) {
            return ResponseEntity.status(401).body(Map.of("error", e.getMessage()));
        } catch (ExpiredJwtException e) {
            return ResponseEntity.status(401).body(Map.of("error", "Session expired. Please login again."));
        } catch (Exception e) {
            return ResponseEntity.status(401).body(Map.of("error", "Authentication failed"));
        }
    }
}
