package com.fintwin.identity;

import com.fintwin.identity.model.User;
import com.fintwin.identity.service.UnverifiedSignupCleanup;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.time.LocalDateTime;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Sign-ups nobody finished: they don't hold the email, and are cleared after a week. */
class UnverifiedSignupIntegrationTest extends AbstractIdentityIntegrationTest {

    private static final String PW = "Test1234!";

    @Autowired UnverifiedSignupCleanup cleanup;

    private ResponseEntity<Map> register(String email, String name) {
        return postJson("/api/auth/register", Map.of(
                "fullName", name, "email", email, "password", PW, "consentGiven", true));
    }

    @Test
    void signingUpAgainOverAnUnfinishedSignupStartsOver() {
        String email = "squatted@test.io";
        assertThat(register(email, "Squatter").getStatusCode()).isEqualTo(HttpStatus.OK);
        Long firstId = userRepository.findByEmail(email).orElseThrow().getId();

        ResponseEntity<Map> again = register(email, "Real Owner");
        assertThat(again.getStatusCode()).isEqualTo(HttpStatus.OK);
        User u = userRepository.findByEmail(email).orElseThrow();
        assertThat(u.getId()).isEqualTo(firstId);
        assertThat(u.getFullName()).isEqualTo("Real Owner");

        // ...and the new OTP is the one that verifies
        String otp = String.valueOf(again.getBody().get("devOtp"));
        assertThat(postJson("/api/auth/verify-email", Map.of("email", email, "otp", otp)).getStatusCode())
                .isEqualTo(HttpStatus.OK);
    }

    @Test
    void aVerifiedAccountStillHoldsItsEmail() {
        seedUser("taken@test.io", PW, "USER");
        assertThat(register("taken@test.io", "Someone Else").getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void theNightlyCleanupRemovesOnlyOldUnfinishedSignups() {
        register("old-unfinished@test.io", "Old");
        register("new-unfinished@test.io", "New");
        User verified = seedUser("old-verified@test.io", PW, "USER");

        // Run as if 8 days from now: the two unverified are past the week, the verified one never qualifies
        int removed = cleanup.run(LocalDateTime.now().plusDays(8));
        assertThat(removed).isGreaterThanOrEqualTo(2);
        assertThat(userRepository.findByEmail("old-unfinished@test.io")).isEmpty();
        assertThat(userRepository.findByEmail("new-unfinished@test.io")).isEmpty();
        assertThat(userRepository.findById(verified.getId())).isPresent();
    }

    @Test
    void aFreshUnfinishedSignupIsLeftAlone() {
        register("fresh@test.io", "Fresh");
        cleanup.run(LocalDateTime.now());
        assertThat(userRepository.findByEmail("fresh@test.io")).isPresent();
    }
}
