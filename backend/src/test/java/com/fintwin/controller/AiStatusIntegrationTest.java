package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** The app can ask whether FinTwin AI is answering before a user asks it anything. */
@TestPropertySource(properties = "ai.service.url=http://localhost:1")   // nothing listens there
class AiStatusIntegrationTest extends AbstractIntegrationTest {

    @Test
    void anySignedInUserSeesThatTheAiIsOffline() {
        String token = seedUserAndGetToken("ai-status-user@example.com", "Test@1234");

        ResponseEntity<Map> res = restTemplate.exchange(baseUrl() + "/api/v1/ai/status", HttpMethod.GET,
                new HttpEntity<>(authHeaders(token)), Map.class);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).containsEntry("available", false).containsKey("checkedAt");
    }

    @Test
    void notForAnonymousCallers() {
        ResponseEntity<Map> res = restTemplate.getForEntity(baseUrl() + "/api/v1/ai/status", Map.class);
        assertThat(res.getStatusCode().value()).isIn(401, 403);
    }
}
