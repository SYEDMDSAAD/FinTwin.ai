package com.fintwin.identity.controller;

import com.fintwin.identity.security.SecurityUtils;
import com.fintwin.identity.service.AdminService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminUserController {

    @Autowired private AdminService adminService;

    @GetMapping("/stats")
    public ResponseEntity<?> stats() {
        return ResponseEntity.ok(adminService.getStats());
    }

    @GetMapping("/users")
    public ResponseEntity<?> listUsers(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return ResponseEntity.ok(adminService.listUsers(page, size));
    }

    @GetMapping("/users/{id}")
    public ResponseEntity<?> getUser(@PathVariable Long id) {
        return ResponseEntity.ok(adminService.getUser(id));
    }

    @PutMapping("/users/{id}/deactivate")
    public ResponseEntity<?> deactivate(@PathVariable Long id) {
        adminService.deactivate(id);
        return ResponseEntity.ok(Map.of("message", "User deactivated"));
    }

    @PutMapping("/users/{id}/activate")
    public ResponseEntity<?> activate(@PathVariable Long id) {
        adminService.activate(id);
        return ResponseEntity.ok(Map.of("message", "User activated"));
    }

    @PutMapping("/users/{id}/role")
    public ResponseEntity<?> changeRole(@PathVariable Long id, @RequestBody Map<String, String> body) {
        adminService.changeRole(id, body.get("role"));
        return ResponseEntity.ok(Map.of("message", "Role updated"));
    }

    @PostMapping("/users/promote-by-email")
    public ResponseEntity<?> promoteByEmail(@RequestBody Map<String, String> body) {
        adminService.promoteByEmail(body.get("email"));
        return ResponseEntity.ok(Map.of("message", "User promoted to ADMIN"));
    }

    @PutMapping("/users/{id}/force-logout")
    public ResponseEntity<?> forceLogout(@PathVariable Long id) {
        adminService.forceLogout(id);
        return ResponseEntity.ok(Map.of("message", "User session invalidated"));
    }

    @PostMapping("/users/{id}/reset-password")
    public ResponseEntity<?> resetPassword(@PathVariable Long id) {
        return ResponseEntity.ok(adminService.resetPassword(id));
    }

    @PostMapping("/users/{id}/impersonate")
    public ResponseEntity<?> impersonate(@PathVariable Long id) {
        String adminEmail = SecurityUtils.getCurrentUserEmail();
        return ResponseEntity.ok(adminService.impersonate(id, adminEmail));
    }

    @PostMapping("/users/{id}/unlock")
    public ResponseEntity<?> unlock(@PathVariable Long id) {
        adminService.unlockUser(id);
        return ResponseEntity.ok(Map.of("message", "Account unlocked"));
    }
}
