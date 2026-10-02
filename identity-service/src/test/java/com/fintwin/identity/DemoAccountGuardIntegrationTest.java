package com.fintwin.identity;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The backend's shared demo account may only read here. Everyone in the demo
 * is the same account, so a visitor's logout would sign out every other
 * visitor, and 2FA or password changes would change the demo for all.
 */
class DemoAccountGuardIntegrationTest extends AbstractIdentityIntegrationTest {

    private static final String DEMO = "demo-guard@fintwin.invalid";

    private ResponseEntity<Map> send(HttpMethod method, String path, String token, Object body) {
        HttpHeaders h = json();
        h.setBearerAuth(token);
        return restTemplate.exchange(url(path), method, new HttpEntity<>(body, h), Map.class);
    }

    @Test
    void theDemoAccountCanReadButNotLogOutOrChangeSecurity() {
        seedUser(DEMO, "Unused-Pw-123!", "DEMO");
        String token = accessTokenFor(DEMO);

        assertThat(send(HttpMethod.GET, "/api/auth/me", token, null).getStatusCode()).isEqualTo(HttpStatus.OK);

        ResponseEntity<Map> logout = send(HttpMethod.POST, "/api/auth/logout", token, Map.of("refreshToken", "x"));
        assertThat(logout.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(logout.getBody()).containsEntry("code", "demo_read_only");
        assertThat(send(HttpMethod.POST, "/api/2fa/setup", token, Map.of()).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(send(HttpMethod.POST, "/api/auth/change-password", token,
                Map.of("currentPassword", "a", "newPassword", "Brand-New-Pw-1!")).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);

        // The rejected logout didn't sign everyone out: the same token still works
        assertThat(userRepository.findByEmail(DEMO).orElseThrow().getLastLogoutAt()).isNull();
        assertThat(send(HttpMethod.GET, "/api/auth/me", token, null).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void ordinaryUsersAreUnaffected() {
        String email = "demo-guard-user@test.io";
        seedUser(email, "Test1234!", "USER");
        ResponseEntity<Map> logout = send(HttpMethod.POST, "/api/auth/logout", accessTokenFor(email),
                Map.of("refreshToken", "unknown"));
        assertThat(logout.getStatusCode()).isNotEqualTo(HttpStatus.FORBIDDEN);
    }
}
