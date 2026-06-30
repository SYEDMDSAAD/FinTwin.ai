package com.fintwin.identity;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regression tests for the 2FA-related security fixes:
 *  - a {@code 2fa_pending} temp token must NOT authenticate as an access token
 *    (the original 2FA bypass), and
 *  - the {@code /api/2fa/debug} endpoint (which leaked the TOTP secret + live
 *    code) must no longer exist.
 */
class TwoFactorSecurityIntegrationTest extends AbstractIdentityIntegrationTest {

    private static final String PW = "Test1234!";

    @Test
    void temp_2fa_token_is_rejected_as_an_access_token() {
        String email = "twofa-temp@test.io";
        seedUser(email, PW, "USER");

        String tempToken = tempTokenFor(email); // type = "2fa_pending"
        ResponseEntity<Map> res = getJson("/api/auth/me", bearer(tempToken));

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void real_access_token_reaches_protected_endpoint() {
        String email = "twofa-access@test.io";
        seedUser(email, PW, "USER");

        String accessToken = accessTokenFor(email);
        ResponseEntity<Map> res = getJson("/api/auth/me", bearer(accessToken));

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).containsEntry("email", email);
    }

    @Test
    void debug_endpoint_no_longer_exists() {
        String email = "twofa-debug@test.io";
        seedUser(email, PW, "USER");

        // Authenticated request — the endpoint must simply be gone (no 2xx, no
        // secret in the body). Spring's catch-all maps the missing handler to 500.
        ResponseEntity<Map> debug = getJson("/api/2fa/debug", bearer(accessTokenFor(email)));
        assertThat(debug.getStatusCode().is2xxSuccessful()).isFalse();
        assertThat(String.valueOf(debug.getBody())).doesNotContain("secret", "expectedCode");

        // ...while the rest of the 2FA controller is still wired up.
        ResponseEntity<Map> status = getJson("/api/2fa/status", bearer(accessTokenFor(email)));
        assertThat(status.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(status.getBody()).containsEntry("enabled", false);
    }

    @Test
    void protected_endpoint_requires_a_token() {
        // No token → Spring Security denies the anonymous request (403, since no
        // custom AuthenticationEntryPoint is configured). Either way: access denied.
        ResponseEntity<Map> res = getJson("/api/auth/me", json());
        assertThat(res.getStatusCode().is4xxClientError()).isTrue();
        assertThat(res.getStatusCode().is2xxSuccessful()).isFalse();
    }
}
