package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration tests for RBAC enforcement.
 *
 * Verifies that:
 *   - Unauthenticated requests to protected endpoints return 401
 *   - USER role cannot access ADMIN endpoints (403)
 *   - USER role can access their own data (200)
 *   - ADMIN role can access admin endpoints (200/2xx)
 */
class RbacIntegrationTest extends AbstractIntegrationTest {

    // ── Unauthenticated access ────────────────────────────────────────────────

    @Test
    void unauthenticated_cannotReadTransactions_returns401() {
        ResponseEntity<Map> resp = restTemplate.getForEntity(
                baseUrl() + "/api/v1/transactions", Map.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void unauthenticated_cannotReadBudgets_returns401() {
        ResponseEntity<Map> resp = restTemplate.getForEntity(
                baseUrl() + "/api/v1/budgets", Map.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void unauthenticated_cannotReadProfile_returns401() {
        ResponseEntity<Map> resp = restTemplate.getForEntity(
                baseUrl() + "/api/v1/profile", Map.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    // ── USER role: blocked from ADMIN endpoints ───────────────────────────────

    @Test
    void userRole_cannotListAdminUsers_returns403() {
        String token = seedUserAndGetToken("rbac-user@example.com", "Test@1234");

        HttpEntity<Void> req = new HttpEntity<>(authHeaders(token));
        ResponseEntity<Map> resp = restTemplate.exchange(
                baseUrl() + "/api/v1/admin/users", HttpMethod.GET, req, Map.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void userRole_cannotAccessRoleAssignment_returns403() {
        String token = seedUserAndGetToken("rbac-user2@example.com", "Test@1234");

        var body = Map.of("email", "target@example.com", "role", "ADMIN");
        HttpEntity<Map> req = new HttpEntity<>(body, authHeaders(token));
        ResponseEntity<Map> resp = restTemplate.exchange(
                baseUrl() + "/api/v1/admin/roles/assign", HttpMethod.POST, req, Map.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    // ── USER role: allowed access to own data ─────────────────────────────────

    @Test
    void userRole_canReadOwnTransactions_returns200() {
        String token = seedUserAndGetToken("txn-access@example.com", "Test@1234");

        HttpEntity<Void> req = new HttpEntity<>(authHeaders(token));
        ResponseEntity<String> resp = restTemplate.exchange(
                baseUrl() + "/api/v1/transactions", HttpMethod.GET, req, String.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void userRole_canReadOwnProfile_returns200() {
        String token = seedUserAndGetToken("profile-access@example.com", "Test@1234");

        HttpEntity<Void> req = new HttpEntity<>(authHeaders(token));
        ResponseEntity<Map> resp = restTemplate.exchange(
                baseUrl() + "/api/v1/profile", HttpMethod.GET, req, Map.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    // ── ADMIN role: can access admin endpoints ────────────────────────────────

    @Test
    void adminRole_canListUsers_returns200() {
        String token = seedAdminAndGetToken("admin-rbac@example.com", "AdminPass@1234");

        HttpEntity<Void> req = new HttpEntity<>(authHeaders(token));
        ResponseEntity<String> resp = restTemplate.exchange(
                baseUrl() + "/api/v1/admin/users", HttpMethod.GET, req, String.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
