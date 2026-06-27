package com.fintwin.controller;

import com.fintwin.audit.Audited;
import com.fintwin.exception.NotFoundException;
import com.fintwin.model.User;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.Role;
import com.fintwin.security.SecurityUtils;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Admin endpoints for role management.
 * All endpoints are also protected at the URL level by hasRole("ADMIN") in SecurityConfig.
 * The @PreAuthorize annotations here provide defense-in-depth at the method level.
 */
@RestController
@RequestMapping("/api/v1/admin/roles")
public class RoleController {

    @Autowired
    private UserRepository userRepository;

    /**
     * Assign a role to a user. MANAGE_ROLES permission required.
     * Body: { "userId": 42, "role": "PREMIUM_USER" }
     */
    @PreAuthorize("hasAuthority('MANAGE_ROLES')")
    @Audited(action = "WRITE", resource = "roles", description = "Role assigned to user")
    @PostMapping("/assign")
    public ResponseEntity<Map<String, String>> assignRole(@RequestBody Map<String, Object> body) {
        Long userId = Long.parseLong(body.get("userId").toString());
        String roleName = body.get("role").toString().toUpperCase();

        Role role = Role.fromString(roleName);
        if (role == Role.USER && !roleName.equals("USER")) {
            return ResponseEntity.badRequest().body(Map.of("error", "Unknown role: " + roleName));
        }

        String adminEmail = SecurityUtils.getCurrentUserEmail();
        User target = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        if (target.getEmail().equals(adminEmail)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Cannot change your own role"));
        }

        target.setRole(roleName);
        userRepository.save(target);

        return ResponseEntity.ok(Map.of(
                "message", "Role assigned",
                "userId", userId.toString(),
                "role", roleName
        ));
    }

    /**
     * Revoke a role from a user (resets to USER). MANAGE_ROLES permission required.
     * Body: { "userId": 42 }
     */
    @PreAuthorize("hasAuthority('MANAGE_ROLES')")
    @Audited(action = "WRITE", resource = "roles", description = "Role revoked, user reset to USER")
    @PostMapping("/revoke")
    public ResponseEntity<Map<String, String>> revokeRole(@RequestBody Map<String, Object> body) {
        Long userId = Long.parseLong(body.get("userId").toString());

        String adminEmail = SecurityUtils.getCurrentUserEmail();
        User target = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        if (target.getEmail().equals(adminEmail)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Cannot revoke your own role"));
        }

        target.setRole("USER");
        userRepository.save(target);

        return ResponseEntity.ok(Map.of("message", "Role revoked", "userId", userId.toString()));
    }

    /**
     * List all users with their roles. READ_ALL_USERS permission required.
     */
    @PreAuthorize("hasAuthority('READ_ALL_USERS')")
    @Audited(action = "READ", resource = "roles", description = "Admin listed all users with roles")
    @GetMapping("/users")
    public ResponseEntity<List<Map<String, Object>>> listUsersWithRoles(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {

        List<User> users = userRepository.findAll();
        List<Map<String, Object>> result = users.stream()
                .skip((long) page * size)
                .limit(size)
                .map(u -> Map.<String, Object>of(
                        "id", u.getId(),
                        "email", u.getEmail() != null ? u.getEmail() : "",
                        "fullName", u.getFullName() != null ? u.getFullName() : "",
                        "role", u.getRole(),
                        "enabled", Boolean.TRUE.equals(u.getEnabled())
                ))
                .collect(Collectors.toList());

        return ResponseEntity.ok(result);
    }

    /**
     * Get a specific user's role. READ_ANY_USER_PROFILE permission required.
     */
    @PreAuthorize("hasAuthority('READ_ANY_USER_PROFILE')")
    @Audited(action = "READ", resource = "roles", description = "Admin viewed user role")
    @GetMapping("/users/{id}")
    public ResponseEntity<Map<String, Object>> getUserRole(@PathVariable Long id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("User not found"));

        return ResponseEntity.ok(Map.of(
                "id", user.getId(),
                "email", user.getEmail() != null ? user.getEmail() : "",
                "role", user.getRole(),
                "permissions", user.getRoleEnum().getPermissions().stream()
                        .map(Enum::name)
                        .sorted()
                        .collect(Collectors.toList())
        ));
    }

    /**
     * Freeze (deactivate) a user account. FREEZE_ANY_ACCOUNT permission required.
     */
    @PreAuthorize("hasAuthority('FREEZE_ANY_ACCOUNT')")
    @Audited(action = "WRITE", resource = "accounts", description = "Admin froze user account")
    @PostMapping("/accounts/freeze/{userId}")
    public ResponseEntity<Map<String, String>> freezeAccount(@PathVariable Long userId) {
        String adminEmail = SecurityUtils.getCurrentUserEmail();
        User target = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        if (target.getEmail().equals(adminEmail)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Cannot freeze your own account"));
        }

        target.setEnabled(false);
        userRepository.save(target);

        return ResponseEntity.ok(Map.of("message", "Account frozen", "userId", userId.toString()));
    }
}
