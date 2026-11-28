package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** AI preferences kept on the server, and "Add money" on a goal. */
@SuppressWarnings({"rawtypes"})
class AiPreferencesAndTopUpIntegrationTest extends AbstractIntegrationTest {

    private ResponseEntity<Map> call(String token, HttpMethod method, String path, Object body) {
        HttpHeaders h = authHeaders(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        return restTemplate.exchange(baseUrl() + path, method, new HttpEntity<>(body, h), Map.class);
    }

    @Test
    void aiPreferencesStartAtTheDefaultsAndAreSaved() {
        String token = seedUserAndGetToken("ai-prefs@example.com", "Test@1234");
        Map first = call(token, HttpMethod.GET, "/api/v1/profile/ai-preferences", null).getBody();
        assertThat(first).containsEntry("mode", "Savings Advisor").containsEntry("dailyInsights", true);

        call(token, HttpMethod.PUT, "/api/v1/profile/ai-preferences",
                Map.of("mode", "Budget Coach", "dailyInsights", false));
        Map after = call(token, HttpMethod.GET, "/api/v1/profile/ai-preferences", null).getBody();
        assertThat(after).containsEntry("mode", "Budget Coach").containsEntry("dailyInsights", false);
    }

    @Test
    void anUnknownModeIsRefused() {
        String token = seedUserAndGetToken("ai-prefs-bad@example.com", "Test@1234");
        assertThat(call(token, HttpMethod.PUT, "/api/v1/profile/ai-preferences", Map.of("mode", "Stock Tipster"))
                .getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void addingMoneyToAGoalMovesItsProgress() {
        String token = seedUserAndGetToken("goal-topup@example.com", "Test@1234");
        Map goal = call(token, HttpMethod.POST, "/api/v1/goals",
                Map.of("title", "Laptop", "targetAmount", 50000, "durationMonths", 10)).getBody();
        Number id = (Number) goal.get("id");

        Map topped = call(token, HttpMethod.POST, "/api/v1/goals/" + id + "/top-up", Map.of("amount", 10000)).getBody();
        assertThat(((Number) topped.get("manualSaved")).doubleValue()).isEqualTo(10000.0);
        assertThat(((Number) topped.get("progressPercent")).doubleValue()).isGreaterThanOrEqualTo(20.0);

        // A mistaken entry can be taken back, never below zero
        Map back = call(token, HttpMethod.POST, "/api/v1/goals/" + id + "/top-up", Map.of("amount", -99999)).getBody();
        assertThat(((Number) back.get("manualSaved")).doubleValue()).isEqualTo(0.0);
    }

    @Test
    void someoneElsesGoalCantBeToppedUp() {
        String owner = seedUserAndGetToken("goal-owner@example.com", "Test@1234");
        Number id = (Number) call(owner, HttpMethod.POST, "/api/v1/goals",
                Map.of("title", "Bike", "targetAmount", 80000, "durationMonths", 8)).getBody().get("id");
        String other = seedUserAndGetToken("goal-other@example.com", "Test@1234");
        assertThat(call(other, HttpMethod.POST, "/api/v1/goals/" + id + "/top-up", Map.of("amount", 500))
                .getStatusCode().is4xxClientError()).isTrue();
    }
}
