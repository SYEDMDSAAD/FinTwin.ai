package com.fintwin.identity.controller;

import com.fintwin.identity.service.AdminService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Bootstrap endpoint for creating the first ADMIN account.
 * Uses X-Admin-Key header instead of JWT — avoids circular dependency
 * (you need an admin to create an admin).
 * Disable in production once initial admin is created.
 */
@RestController
@RequestMapping("/admin")
public class AdminBootstrapController {

    @Autowired private AdminService adminService;

    @Value("${admin.key:}")
    private String adminKey;

    @PostMapping("/promote")
    public ResponseEntity<?> promote(
            @RequestHeader(value = "X-Admin-Key", required = false) String key,
            @RequestBody Map<String, String> body) {

        if (adminKey == null || adminKey.isBlank())
            return ResponseEntity.status(503).body("Admin bootstrap is not configured");
        if (key == null || !java.security.MessageDigest.isEqual(
                adminKey.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                key.getBytes(java.nio.charset.StandardCharsets.UTF_8)))
            return ResponseEntity.status(403).body("Invalid admin key");

        String result = adminService.promoteBootstrap(body.get("email"));
        return ResponseEntity.ok(result);
    }
}
