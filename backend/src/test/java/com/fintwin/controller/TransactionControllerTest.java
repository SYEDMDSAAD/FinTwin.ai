package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration tests for the transaction endpoints.
 * Tests the HTTP layer end-to-end with real DB and real JWT validation.
 */
class TransactionControllerTest extends AbstractIntegrationTest {

    // ── Auth guard ────────────────────────────────────────────────────────────

    @Test
    void getTransactions_withoutToken_returns401() {
        ResponseEntity<String> resp = restTemplate.getForEntity(
                baseUrl() + "/api/v1/transactions", String.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    // ── Empty state ───────────────────────────────────────────────────────────

    @Test
    void getTransactions_forNewUser_returnsEmptyArray() {
        String token = seedUserAndGetToken("no-txns@example.com", "Test@1234");

        HttpEntity<Void> req = new HttpEntity<>(authHeaders(token));
        ResponseEntity<String> resp = restTemplate.exchange(
                baseUrl() + "/api/v1/transactions", HttpMethod.GET, req, String.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).isEqualTo("[]");
    }

    // ── Input validation ──────────────────────────────────────────────────────

    @Test
    void addExpense_withBlankText_returns400() {
        String token = seedUserAndGetToken("blank-expense@example.com", "Test@1234");

        var body = Map.of("text", "");
        HttpEntity<Map> req = new HttpEntity<>(body, authHeaders(token));
        ResponseEntity<Map> resp = restTemplate.exchange(
                baseUrl() + "/api/v1/transactions/expense", HttpMethod.POST, req, Map.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void addExpense_withoutToken_returns401() {
        var body = Map.of("text", "coffee 150");
        ResponseEntity<Map> resp = restTemplate.postForEntity(
                baseUrl() + "/api/v1/transactions/expense", body, Map.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    // ── CSV upload validation ─────────────────────────────────────────────────

    @Test
    void uploadCsv_withoutToken_returns401() {
        HttpEntity<String> req = new HttpEntity<>("date,merchant,amount\n2026-01-01,Test,100");
        ResponseEntity<String> resp = restTemplate.exchange(
                baseUrl() + "/api/v1/transactions/upload", HttpMethod.POST, req, String.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
