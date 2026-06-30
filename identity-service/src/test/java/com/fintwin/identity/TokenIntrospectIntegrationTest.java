package com.fintwin.identity;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tests for the internal {@code /api/token/introspect} endpoint used by resource
 * servers (backend, ai-service). Verifies it fails closed without the shared
 * internal key and that a {@code 2fa_pending} temp token is reported inactive.
 */
class TokenIntrospectIntegrationTest extends AbstractIdentityIntegrationTest {

    private static final String PW = "Test1234!";
    private static final String INTERNAL_KEY = "test-internal-key"; // application-test.properties

    private HttpHeaders withKey(String key) {
        HttpHeaders h = json();
        if (key != null) h.set("X-Internal-Key", key);
        return h;
    }

    @Test
    void introspect_without_internal_key_is_forbidden() {
        seedUser("intro-nokey@test.io", PW, "USER");
        String token = accessTokenFor("intro-nokey@test.io");

        ResponseEntity<Map> res = postJson("/api/token/introspect", Map.of("token", token), json());
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void introspect_with_wrong_internal_key_is_forbidden() {
        seedUser("intro-badkey@test.io", PW, "USER");
        String token = accessTokenFor("intro-badkey@test.io");

        ResponseEntity<Map> res = postJson("/api/token/introspect",
                Map.of("token", token), withKey("not-the-key"));
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void introspect_valid_access_token_is_active() {
        String email = "intro-valid@test.io";
        seedUser(email, PW, "USER");

        ResponseEntity<Map> res = postJson("/api/token/introspect",
                Map.of("token", accessTokenFor(email)), withKey(INTERNAL_KEY));

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).containsEntry("active", true);
        assertThat(res.getBody()).containsEntry("email", email);
        assertThat(res.getBody()).containsEntry("role", "USER");
    }

    @Test
    void introspect_reports_temp_2fa_token_as_inactive() {
        String email = "intro-temp@test.io";
        seedUser(email, PW, "USER");

        ResponseEntity<Map> res = postJson("/api/token/introspect",
                Map.of("token", tempTokenFor(email)), withKey(INTERNAL_KEY));

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).containsEntry("active", false);
    }

    @Test
    void introspect_reports_garbage_token_as_inactive() {
        ResponseEntity<Map> res = postJson("/api/token/introspect",
                Map.of("token", "not.a.jwt"), withKey(INTERNAL_KEY));

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).containsEntry("active", false);
    }
}
