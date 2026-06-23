package com.fintwin.controller;

import com.fintwin.service.AdminUserService;
import com.fintwin.service.EncryptionMigrationService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.NoSuchElementException;

@RestController
@RequestMapping("/admin")
public class AdminController {

    @Value("${admin.key:}")
    private String adminKey;

    private final EncryptionMigrationService migrationService;
    private final AdminUserService adminUserService;

    public AdminController(
            EncryptionMigrationService migrationService,
            AdminUserService adminUserService
    ) {
        this.migrationService = migrationService;
        this.adminUserService = adminUserService;
    }

    /**
     * Re-encrypts all legacy plain-text data in the DB.
     * Call once after enabling field encryption.
     *
     * curl -X POST http://localhost:8080/admin/migrate-encryption \
     *      -H "X-Admin-Key: <value of ADMIN_KEY in .env>"
     */
    @PostMapping("/migrate-encryption")
    public ResponseEntity<?> migrateEncryption(
            @RequestHeader(value = "X-Admin-Key", required = false) String key) {

        if (!isValidAdminKey(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Invalid admin key.");
        }

        EncryptionMigrationService.MigrationResult result = migrationService.migrateAll();
        return ResponseEntity.ok(result);
    }

    /**
     * Bootstraps the first ADMIN user by email.
     * Only callable with the server-side ADMIN_KEY secret.
     *
     * curl -X POST http://localhost:8080/admin/promote \
     *      -H "X-Admin-Key: <ADMIN_KEY>" \
     *      -H "Content-Type: application/json" \
     *      -d '{"email":"you@example.com"}'
     */
    @PostMapping("/promote")
    public ResponseEntity<?> promoteUser(
            @RequestHeader(value = "X-Admin-Key", required = false) String key,
            @RequestBody PromoteRequest request) {

        if (!isValidAdminKey(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Invalid admin key.");
        }

        try {
            adminUserService.promoteToAdmin(request.getEmail());
            return ResponseEntity.ok("User promoted to ADMIN: " + request.getEmail());
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body("User not found.");
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    private boolean isValidAdminKey(String key) {
        return adminKey != null && !adminKey.isBlank() && adminKey.equals(key);
    }

    public static class PromoteRequest {
        private String email;
        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }
    }
}
