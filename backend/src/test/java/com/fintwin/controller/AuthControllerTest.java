package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration tests for the authentication flow.
 * Every test runs against a real PostgreSQL container with Flyway migrations applied.
 */
class AuthControllerTest extends AbstractIntegrationTest {

    // ── Registration ──────────────────────────────────────────────────────────

    @Test
    void register_withValidPayload_returns200() {
        var body = Map.of(
            "fullName",     "Integration User",
            "email",        "register-ok@example.com",
            "password",     "SecurePass@123",
            "consentGiven", true
        );

        ResponseEntity<Map> resp = restTemplate.postForEntity(
                baseUrl() + "/api/v1/auth/register", body, Map.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void register_withInvalidEmail_returns400() {
        var body = Map.of(
            "fullName",     "Bad Email",
            "email",        "not-an-email",
            "password",     "SecurePass@123",
            "consentGiven", true
        );

        ResponseEntity<Map> resp = restTemplate.postForEntity(
                baseUrl() + "/api/v1/auth/register", body, Map.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void register_withShortPassword_returns400() {
        var body = Map.of(
            "fullName",     "Short Pass",
            "email",        "short-pass@example.com",
            "password",     "abc",
            "consentGiven", true
        );

        ResponseEntity<Map> resp = restTemplate.postForEntity(
                baseUrl() + "/api/v1/auth/register", body, Map.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void register_withMissingFullName_returns400() {
        var body = Map.of(
            "email",        "no-name@example.com",
            "password",     "SecurePass@123",
            "consentGiven", true
        );

        ResponseEntity<Map> resp = restTemplate.postForEntity(
                baseUrl() + "/api/v1/auth/register", body, Map.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    // ── Login ─────────────────────────────────────────────────────────────────

    @Test
    void login_withNonExistentEmail_returns401() {
        var body = Map.of(
            "email",    "ghost@example.com",
            "password", "SomePass@123"
        );

        ResponseEntity<Map> resp = restTemplate.postForEntity(
                baseUrl() + "/api/v1/auth/login", body, Map.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    // ── /me endpoint ──────────────────────────────────────────────────────────

    @Test
    void getMe_withoutToken_returns401() {
        ResponseEntity<Map> resp = restTemplate.getForEntity(
                baseUrl() + "/api/v1/auth/me", Map.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void getMe_withValidToken_returns200AndEmail() {
        String token = seedUserAndGetToken("me-endpoint@example.com", "Test@1234");

        HttpEntity<Void> req = new HttpEntity<>(authHeaders(token));
        ResponseEntity<Map> resp = restTemplate.exchange(
                baseUrl() + "/api/v1/auth/me", HttpMethod.GET, req, Map.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).containsKey("email");
    }
}
