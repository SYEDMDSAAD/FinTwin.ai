package com.fintwin.controller;

import com.fintwin.security.SecurityUtils;
import com.fintwin.service.AdminUserService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/admin")
public class AdminApiController {

    @Autowired
    private AdminUserService adminUserService;

    // ── Stats ─────────────────────────────────────────────────────────────────

    @GetMapping("/stats")
    public ResponseEntity<?> getStats() {
        return ResponseEntity.ok(adminUserService.getStats());
    }

    // ── Users list ────────────────────────────────────────────────────────────

    @GetMapping("/users")
    public ResponseEntity<?> listUsers(
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "50") int size) {
        return ResponseEntity.ok(adminUserService.listUsers(page, size));
    }

    // ── User detail ───────────────────────────────────────────────────────────

    @GetMapping("/users/{id}")
    public ResponseEntity<?> getUserDetail(@PathVariable Long id) {
        return adminUserService.getUserDetail(id)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    // ── Enable / Disable ─────────────────────────────────────────────────────

    @PutMapping("/users/{id}/deactivate")
    public ResponseEntity<?> deactivateUser(@PathVariable Long id, HttpServletRequest req) {
        try {
            adminUserService.deactivateUser(id, SecurityUtils.getCurrentUserEmail(),
                    getIp(req), req.getHeader("User-Agent"), req.getMethod(), req.getRequestURI());
            return ResponseEntity.ok(Map.of("message", "User deactivated."));
        } catch (NoSuchElementException e)     { return ResponseEntity.notFound().build(); }
          catch (IllegalArgumentException e)   { return ResponseEntity.badRequest().body(e.getMessage()); }
    }

    @PutMapping("/users/{id}/activate")
    public ResponseEntity<?> activateUser(@PathVariable Long id, HttpServletRequest req) {
        try {
            adminUserService.activateUser(id, SecurityUtils.getCurrentUserEmail(),
                    getIp(req), req.getHeader("User-Agent"), req.getMethod(), req.getRequestURI());
            return ResponseEntity.ok(Map.of("message", "User activated."));
        } catch (NoSuchElementException e) { return ResponseEntity.notFound().build(); }
    }

    // ── Role change ───────────────────────────────────────────────────────────

    @PutMapping("/users/{id}/role")
    public ResponseEntity<?> changeRole(@PathVariable Long id, @RequestBody Map<String, String> body,
                                        HttpServletRequest req) {
        try {
            adminUserService.changeRole(id, body.get("role"), SecurityUtils.getCurrentUserEmail(),
                    getIp(req), req.getHeader("User-Agent"), req.getMethod(), req.getRequestURI());
            return ResponseEntity.ok(Map.of("message", "Role updated to " + body.get("role") + "."));
        } catch (NoSuchElementException e)   { return ResponseEntity.notFound().build(); }
          catch (IllegalArgumentException e) { return ResponseEntity.badRequest().body(e.getMessage()); }
    }

    // ── Promote by email ──────────────────────────────────────────────────────

    @PostMapping("/users/promote-by-email")
    public ResponseEntity<?> promoteByEmail(@RequestBody Map<String, String> body, HttpServletRequest req) {
        String email = body.get("email");
        if (email == null || email.isBlank()) return ResponseEntity.badRequest().body("Email is required.");
        try {
            adminUserService.promoteByEmail(email, SecurityUtils.getCurrentUserEmail(),
                    getIp(req), req.getHeader("User-Agent"), req.getMethod(), req.getRequestURI());
            return ResponseEntity.ok(Map.of("message", "Promoted to ADMIN: " + email));
        } catch (NoSuchElementException e)   { return ResponseEntity.status(HttpStatus.NOT_FOUND).body(e.getMessage()); }
          catch (IllegalArgumentException e) { return ResponseEntity.badRequest().body(e.getMessage()); }
    }

    // ── Force logout ──────────────────────────────────────────────────────────

    @PutMapping("/users/{id}/force-logout")
    public ResponseEntity<?> forceLogout(@PathVariable Long id, HttpServletRequest req) {
        try {
            adminUserService.forceLogout(id, SecurityUtils.getCurrentUserEmail(),
                    getIp(req), req.getHeader("User-Agent"), req.getMethod(), req.getRequestURI());
            return ResponseEntity.ok(Map.of("message", "User session invalidated."));
        } catch (NoSuchElementException e) { return ResponseEntity.notFound().build(); }
    }

    // ── Reset password ────────────────────────────────────────────────────────

    @PostMapping("/users/{id}/reset-password")
    public ResponseEntity<?> resetPassword(@PathVariable Long id, HttpServletRequest req) {
        try {
            Map<String, Object> result = adminUserService.resetPassword(id, SecurityUtils.getCurrentUserEmail(),
                    getIp(req), req.getHeader("User-Agent"), req.getMethod(), req.getRequestURI());
            return ResponseEntity.ok(result);
        } catch (NoSuchElementException e) { return ResponseEntity.notFound().build(); }
    }

    // ── Impersonate ───────────────────────────────────────────────────────────

    @PostMapping("/users/{id}/impersonate")
    public ResponseEntity<?> impersonate(@PathVariable Long id, HttpServletRequest req) {
        try {
            Map<String, Object> result = adminUserService.impersonate(id, SecurityUtils.getCurrentUserEmail(),
                    getIp(req), req.getHeader("User-Agent"), req.getMethod(), req.getRequestURI());
            return ResponseEntity.ok(result);
        } catch (NoSuchElementException e)   { return ResponseEntity.notFound().build(); }
          catch (IllegalArgumentException e) { return ResponseEntity.badRequest().body(e.getMessage()); }
    }

    // ── Delete user ───────────────────────────────────────────────────────────

    @DeleteMapping("/users/{id}")
    public ResponseEntity<?> deleteUser(@PathVariable Long id, HttpServletRequest req) {
        try {
            adminUserService.deleteUser(id, SecurityUtils.getCurrentUserEmail(),
                    getIp(req), req.getHeader("User-Agent"), req.getMethod(), req.getRequestURI());
            return ResponseEntity.ok(Map.of("message", "User and all data deleted."));
        } catch (NoSuchElementException e)   { return ResponseEntity.notFound().build(); }
          catch (IllegalArgumentException e) { return ResponseEntity.badRequest().body(e.getMessage()); }
    }

    // ── Audit logs ────────────────────────────────────────────────────────────

    @GetMapping("/audit-logs")
    public ResponseEntity<?> getAuditLogs(
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false)    String action) {
        return ResponseEntity.ok(adminUserService.getAuditLogs(page, size, action));
    }

    // ── Analytics ─────────────────────────────────────────────────────────────

    @GetMapping("/analytics/signups")
    public ResponseEntity<?> signupTrend(@RequestParam(defaultValue = "30") int days) {
        return ResponseEntity.ok(adminUserService.getSignupTrend(days));
    }

    @GetMapping("/analytics/adoption")
    public ResponseEntity<?> adoptionStats() {
        return ResponseEntity.ok(adminUserService.getAdoptionStats());
    }

    // ── Platform health ───────────────────────────────────────────────────────

    @GetMapping("/health")
    public ResponseEntity<?> health() {
        return ResponseEntity.ok(adminUserService.getHealth());
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private String getIp(HttpServletRequest req) {
        String forwarded = req.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) return forwarded.split(",")[0].trim();
        String realIp = req.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) return realIp.trim();
        return req.getRemoteAddr();
    }
}
