package com.fintwin.identity.controller;

import com.fintwin.identity.security.SecurityUtils;
import com.fintwin.identity.service.TwoFactorService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/2fa")
public class TwoFactorController {

    @Autowired private TwoFactorService twoFactorService;

    @GetMapping("/status")
    public ResponseEntity<?> status() {
        String email = SecurityUtils.getCurrentUserEmail();
        return ResponseEntity.ok(Map.of("enabled", twoFactorService.isEnabled(email)));
    }

    @PostMapping("/setup")
    public ResponseEntity<?> setup() {
        String email = SecurityUtils.getCurrentUserEmail();
        return ResponseEntity.ok(twoFactorService.setup(email));
    }

    @PostMapping("/enable")
    public ResponseEntity<?> enable(@RequestBody Map<String, String> body) {
        String email = SecurityUtils.getCurrentUserEmail();
        int code = Integer.parseInt(body.getOrDefault("code", "0").replaceAll("\\s", ""));
        twoFactorService.enable(email, code);
        return ResponseEntity.ok(Map.of("message", "Two-factor authentication enabled successfully."));
    }

    @PostMapping("/disable")
    public ResponseEntity<?> disable(@RequestBody Map<String, String> body) {
        String email = SecurityUtils.getCurrentUserEmail();
        int code = Integer.parseInt(body.getOrDefault("code", "0").replaceAll("\\s", ""));
        twoFactorService.disable(email, code);
        return ResponseEntity.ok(Map.of("message", "Two-factor authentication disabled."));
    }
}
