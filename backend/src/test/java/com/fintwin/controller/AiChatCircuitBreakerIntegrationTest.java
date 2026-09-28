package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.test.context.TestPropertySource;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The copilot's circuit breaker actually sees its calls. It used to sit on a
 * method ChatService called on itself, which skips Spring's proxy: seven
 * failed calls left it CLOSED with zero calls recorded.
 */
@TestPropertySource(properties = "ai.service.url=http://localhost:1")   // nothing listens there
class AiChatCircuitBreakerIntegrationTest extends AbstractIntegrationTest {

    @Autowired private CircuitBreakerRegistry registry;

    @AfterEach
    void resetBreaker() {
        registry.circuitBreaker("ai-chat").reset();
    }

    private ResponseEntity<Map> ask(String token) {
        HttpHeaders h = authHeaders(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        return restTemplate.exchange(baseUrl() + "/api/v1/transactions/chat", HttpMethod.POST,
                new HttpEntity<>(Map.of("message", "how much did I spend?", "mode", "Budget Coach"), h),
                Map.class);
    }

    @Test
    void repeatedFailuresOpenTheBreakerAndLaterCallsFailFast() {
        String token = seedUserAndGetToken("breaker-user@example.com", "Test@1234");
        CircuitBreaker breaker = registry.circuitBreaker("ai-chat");

        // (The test's HTTP client retries a 503 once by itself, so each request
        // here can reach the backend twice; counts are compared, not assumed.)
        for (int i = 0; i < 5; i++) {
            assertThat(ask(token).getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        }
        assertThat(breaker.getState()).isEqualTo(CircuitBreaker.State.OPEN);

        // Open: the AI service isn't called at all, and the user still gets the friendly reply
        int failedBefore = breaker.getMetrics().getNumberOfFailedCalls();
        long blockedBefore = breaker.getMetrics().getNumberOfNotPermittedCalls();
        ResponseEntity<Map> blocked = ask(token);
        assertThat(blocked.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(blocked.getBody()).containsEntry("reply", "FinTwin AI is unavailable right now. Please try again in a moment.");
        assertThat(breaker.getMetrics().getNumberOfNotPermittedCalls()).isGreaterThan(blockedBefore);
        assertThat(breaker.getMetrics().getNumberOfFailedCalls()).isEqualTo(failedBefore);
    }

    @Test
    void theCopilotBreakerIsSeparateFromTheForecastOne() {
        String token = seedUserAndGetToken("breaker-separate@example.com", "Test@1234");
        for (int i = 0; i < 5; i++) ask(token);

        assertThat(registry.circuitBreaker("ai-chat").getState()).isEqualTo(CircuitBreaker.State.OPEN);
        assertThat(registry.circuitBreaker("ai-service").getState()).isEqualTo(CircuitBreaker.State.CLOSED);
    }
}
