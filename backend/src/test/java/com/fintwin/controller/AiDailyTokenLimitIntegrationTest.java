package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The per-user daily token allowance, checked before the AI service is called.
 * Nothing listens at the AI service URL, so a call that gets past the check
 * answers 503 — which is how these tests tell "blocked" from "allowed".
 */
@TestPropertySource(properties = {
        "ai.service.url=http://localhost:1",
        "ai.daily-token-limit=1000",
})
class AiDailyTokenLimitIntegrationTest extends AbstractIntegrationTest {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private CircuitBreakerRegistry breakers;

    @AfterEach
    void resetBreaker() {
        breakers.circuitBreaker("ai-chat").reset();
    }

    private void usedToday(String email, long tokens) {
        Long id = userRepository.findByEmail(email).orElseThrow().getId();
        jdbc.update("INSERT INTO ai_token_usage (user_id, usage_date, feature, input_tokens, output_tokens, calls) "
                + "VALUES (?, CURRENT_DATE, 'copilot', ?, 0, 1)", id, tokens);
    }

    private ResponseEntity<Map> ask(String token) {
        HttpHeaders h = authHeaders(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        return restTemplate.exchange(baseUrl() + "/api/v1/transactions/chat", HttpMethod.POST,
                new HttpEntity<>(Map.of("message", "how much did I spend?", "mode", "Budget Coach"), h), Map.class);
    }

    @Test
    void overTheAllowanceTheCopilotSaysSoAndNeverCallsTheModel() {
        String token = seedUserAndGetToken("quota-over@example.com", "Test@1234");
        usedToday("quota-over@example.com", 1000);

        ResponseEntity<Map> r = ask(token);
        assertThat(r.getStatusCode().value()).isEqualTo(429);
        assertThat((String) r.getBody().get("reply")).contains("today's FinTwin AI limit");
    }

    @Test
    void underTheAllowanceTheCallGoesAhead() {
        String token = seedUserAndGetToken("quota-under@example.com", "Test@1234");
        usedToday("quota-under@example.com", 999);
        assertThat(ask(token).getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);   // reached the (absent) AI service
    }

    @Test
    void adminsAreNotCapped() {
        String token = seedAdminAndGetToken("quota-admin@example.com", "Test@1234");
        usedToday("quota-admin@example.com", 50_000);
        assertThat(ask(token).getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    }

    @Test
    void oneUsersAllowanceDoesNotOpenTheCircuitBreakerForEveryone() {
        String token = seedUserAndGetToken("quota-breaker@example.com", "Test@1234");
        usedToday("quota-breaker@example.com", 5000);
        for (int i = 0; i < 6; i++) assertThat(ask(token).getStatusCode().value()).isEqualTo(429);
        assertThat(breakers.circuitBreaker("ai-chat").getState()).isEqualTo(CircuitBreaker.State.CLOSED);
    }
}
