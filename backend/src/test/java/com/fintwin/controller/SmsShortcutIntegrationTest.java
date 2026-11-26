package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class SmsShortcutIntegrationTest extends AbstractIntegrationTest {

    private static final String SBI = "Dear UPI user A/C X1234 debited by 250.00 on date 25Nov26 trf to ZOMATO "
            + "Refno 600011112222 If not u? call-1800111109 -SBI";

    private ResponseEntity<Map> send(String key, Object body) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (key != null) h.set("X-FinTwin-Key", key);
        return restTemplate.exchange(baseUrl() + "/api/v1/sms/shortcut", HttpMethod.POST, new HttpEntity<>(body, h), Map.class);
    }

    @Test
    void anIphoneShortcutSendsOneMessageWithTheUsersKey() {
        String token = seedUserAndGetToken("shortcut@example.com", "Test@1234");
        ResponseEntity<Map> keyed = restTemplate.exchange(baseUrl() + "/api/v1/sms/shortcut-key", HttpMethod.GET,
                new HttpEntity<>(authHeaders(token)), Map.class);
        assertThat(keyed.getStatusCode()).isEqualTo(HttpStatus.OK);
        String key = (String) keyed.getBody().get("key");
        assertThat(key).startsWith("ft1.");

        ResponseEntity<Map> first = send(key, Map.of("sender", "", "message", SBI));
        assertThat(first.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(first.getBody()).containsEntry("imported", 1);
        // The automation fires twice for the same message: still one transaction
        assertThat(send(key, Map.of("message", SBI)).getBody()).containsEntry("imported", 0);

        assertThat(send(null, Map.of("message", SBI)).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(send("ft1.1.nope", Map.of("message", SBI)).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);

        // A new key retires the old one
        ResponseEntity<Map> rotated = restTemplate.exchange(baseUrl() + "/api/v1/sms/shortcut-key/rotate", HttpMethod.POST,
                new HttpEntity<>(authHeaders(token)), Map.class);
        assertThat(rotated.getBody().get("key")).isNotEqualTo(key);
        assertThat(send(key, Map.of("message", SBI)).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
