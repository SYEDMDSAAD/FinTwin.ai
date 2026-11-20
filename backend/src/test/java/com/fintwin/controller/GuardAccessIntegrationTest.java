package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import com.fintwin.demo.DemoAccountService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Who can reach Spend Guard, through the real security chain: logged-out
 * visitors and the shared demo account never do, and a normal user who isn't
 * on the prototype allowlist is turned away before anything leaves the backend.
 */
@TestPropertySource(properties = {
        "guard.service.url=http://localhost:1",   // nothing listens there
        "guard.allowed-users="                    // nobody is allowlisted
})
class GuardAccessIntegrationTest extends AbstractIntegrationTest {

    @Autowired private DemoAccountService demo;

    private ResponseEntity<Map> post(String token, String action) {
        HttpHeaders h = token == null ? new HttpHeaders() : authHeaders(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        return restTemplate.exchange(baseUrl() + "/api/v1/guard/" + action, HttpMethod.POST,
                new HttpEntity<>(Map.of("amount", 100), h), Map.class);
    }

    private ResponseEntity<Map> get(String token, String path) {
        return restTemplate.exchange(baseUrl() + "/api/v1/guard/" + path, HttpMethod.GET,
                new HttpEntity<>(authHeaders(token)), Map.class);
    }

    @Test
    void loggedOut_is401() {
        assertThat(post(null, "check").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void normalUserNotOnTheAllowlist_isTurnedAway() {
        String token = seedUserAndGetToken("guard-not-allowed@example.com", "Test@1234");

        ResponseEntity<Map> resp = post(token, "check");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(resp.getBody()).containsEntry("error", GuardController.NOT_OPEN);
        assertThat(get(token, "enabled").getBody()).containsEntry("enabled", false);
        // "I didn't pay" is behind the same allowlist
        assertThat(post(token, "unrecord").getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void unknownAction_is404_evenForALoggedInUser() {
        String token = seedUserAndGetToken("guard-unknown-action@example.com", "Test@1234");
        assertThat(post(token, "delete-everything").getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void demoAccount_lacksThePermission() {
        demo.rebuild();
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<Map> start = restTemplate.exchange(baseUrl() + "/api/v1/demo/start", HttpMethod.POST,
                new HttpEntity<>(Map.of("visitorId", "guard-visitor-0001", "source", "test"), h), Map.class);
        String token = (String) start.getBody().get("accessToken");

        // GET passes the demo read-only filter, so this is the permission check answering
        ResponseEntity<Map> enabled = get(token, "enabled");
        assertThat(enabled.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        // and a write is stopped too
        assertThat(post(token, "check").getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }
}
