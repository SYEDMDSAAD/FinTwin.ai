package com.fintwin.controller;

import com.fintwin.security.SecurityUtils;
import com.fintwin.service.SecurityAdminService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin/security")
public class SecurityAdminController {

    @Autowired
    private SecurityAdminService securityAdminService;

    @GetMapping("/posture")
    public ResponseEntity<?> posture() {
        return ResponseEntity.ok(securityAdminService.getPosture());
    }

    @GetMapping("/brute-force")
    public ResponseEntity<?> bruteForce(
            @RequestParam(defaultValue = "1") int hours,
            @RequestParam(defaultValue = "3") int threshold) {
        return ResponseEntity.ok(securityAdminService.getBruteForce(hours, threshold));
    }

    @GetMapping("/account-attacks")
    public ResponseEntity<?> accountAttacks(
            @RequestParam(defaultValue = "24") int hours,
            @RequestParam(defaultValue = "3")  int threshold) {
        return ResponseEntity.ok(securityAdminService.getAccountAttacks(hours, threshold));
    }

    @GetMapping("/suspicious-sessions")
    public ResponseEntity<?> suspiciousSessions(@RequestParam(defaultValue = "24") int hours) {
        return ResponseEntity.ok(securityAdminService.getSuspiciousSessions(hours));
    }

    @GetMapping("/data-anomalies")
    public ResponseEntity<?> dataAnomalies(
            @RequestParam(defaultValue = "24") int hours,
            @RequestParam(defaultValue = "50") int threshold) {
        return ResponseEntity.ok(securityAdminService.getDataAnomalies(hours, threshold));
    }

    @GetMapping("/blocked-ips")
    public ResponseEntity<?> listBlockedIPs() {
        return ResponseEntity.ok(securityAdminService.listBlockedIPs());
    }

    @PostMapping("/blocked-ips")
    public ResponseEntity<?> blockIP(@RequestBody Map<String, String> body) {
        String ip = body.get("ip");
        if (ip == null || ip.isBlank())
            return ResponseEntity.badRequest().body("IP is required.");
        try {
            securityAdminService.blockIP(ip, body.get("reason"), body.get("expiresHours"),
                    SecurityUtils.getCurrentUserEmail());
            return ResponseEntity.ok(Map.of("message", "IP blocked: " + ip));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @DeleteMapping("/blocked-ips/{ip}")
    public ResponseEntity<?> unblockIP(@PathVariable String ip) {
        if (securityAdminService.unblockIP(ip))
            return ResponseEntity.ok(Map.of("message", "IP unblocked."));
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "IP not found."));
    }
}
