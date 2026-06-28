package com.fintwin.identity;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * End-to-end auth flow tests against a real Postgres container, exercising the
 * full filter + controller + service + DB stack.
 */
class AuthFlowIntegrationTest extends AbstractIdentityIntegrationTest {

    private static final String PW = "Test1234!";

    private Map<String, Object> register(String email) {
        ResponseEntity<Map> res = postJson("/api/auth/register", Map.of(
                "fullName", "Reg Tester",
                "email", email,
                "password", PW,
                "consentGiven", true));
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        @SuppressWarnings("unchecked")
        Map<String, Object> body = res.getBody();
        return body;
    }

    @Test
    void login_is_blocked_until_email_is_verified() {
        String email = "verify-required@test.io";
        Map<String, Object> reg = register(email);
        // Mail is disabled in tests, so the OTP is returned for dev/testing.
        assertThat(reg).containsKey("devOtp");

        ResponseEntity<Map> login = postJson("/api/auth/login", Map.of("email", email, "password", PW));
        assertThat(login.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(login.getBody()).containsEntry("error", "EMAIL_NOT_VERIFIED");
    }

    @Test
    void verifying_email_then_login_succeeds() {
        String email = "verify-then-login@test.io";
        Map<String, Object> reg = register(email);
        String otp = String.valueOf(reg.get("devOtp"));

        ResponseEntity<Map> verify = postJson("/api/auth/verify-email", Map.of("email", email, "otp", otp));
        assertThat(verify.getStatusCode()).isEqualTo(HttpStatus.OK);

        ResponseEntity<Map> login = postJson("/api/auth/login", Map.of("email", email, "password", PW));
        assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(login.getBody()).containsKeys("accessToken", "refreshToken");
        assertThat(login.getBody().get("accessToken")).isNotNull();
    }

    @Test
    void wrong_password_is_rejected() {
        String email = "wrong-pw@test.io";
        seedUser(email, PW, "USER");

        ResponseEntity<Map> login = postJson("/api/auth/login", Map.of("email", email, "password", "WrongPass1!"));
        assertThat(login.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(login.getBody()).containsEntry("error", "Invalid credentials");
    }

    @Test
    void account_locks_after_five_failed_attempts() {
        String email = "lockout@test.io";
        seedUser(email, PW, "USER");

        // Valid-length but wrong passwords so they reach the credential check
        // (not bean validation) and register a failed attempt.
        for (int i = 0; i < 5; i++) {
            ResponseEntity<Map> bad = postJson("/api/auth/login",
                    Map.of("email", email, "password", "WrongPass" + i + "!"));
            assertThat(bad.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        }
        // The failed-attempt counter must have persisted (REQUIRES_NEW), so the
        // account is now locked in the DB.
        var locked0 = userRepository.findByEmail(email).orElseThrow();
        assertThat(locked0.getFailedLoginAttempts()).isGreaterThanOrEqualTo(5);
        assertThat(locked0.getLockedUntil()).isNotNull();

        // Even the correct password is now refused while the account is locked.
        ResponseEntity<Map> locked = postJson("/api/auth/login", Map.of("email", email, "password", PW));
        assertThat(locked.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(String.valueOf(locked.getBody().get("error"))).containsIgnoringCase("locked");
    }

    @Test
    void forgot_password_does_not_reveal_whether_account_exists() {
        // Unknown email must not 404 / error — same status as the known case.
        ResponseEntity<Map> unknown = postJson("/api/auth/forgot-password",
                Map.of("email", "nobody-here@test.io"));
        assertThat(unknown.getStatusCode()).isEqualTo(HttpStatus.OK);

        String known = "forgot-known@test.io";
        seedUser(known, PW, "USER");
        ResponseEntity<Map> exists = postJson("/api/auth/forgot-password", Map.of("email", known));
        assertThat(exists.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void refresh_rotates_and_old_token_cannot_be_reused() {
        String email = "refresh-rotate@test.io";
        seedUser(email, PW, "USER");

        ResponseEntity<Map> login = postJson("/api/auth/login", Map.of("email", email, "password", PW));
        assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);
        String oldRefresh = String.valueOf(login.getBody().get("refreshToken"));

        ResponseEntity<Map> rotated = postJson("/api/auth/refresh", Map.of("refreshToken", oldRefresh));
        assertThat(rotated.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(rotated.getBody()).containsKeys("accessToken", "refreshToken");
        assertThat(String.valueOf(rotated.getBody().get("refreshToken"))).isNotEqualTo(oldRefresh);

        // Reusing the now-rotated (revoked) refresh token must be rejected.
        ResponseEntity<Map> reuse = postJson("/api/auth/refresh", Map.of("refreshToken", oldRefresh));
        assertThat(reuse.getStatusCode().is2xxSuccessful()).isFalse();
    }
}
