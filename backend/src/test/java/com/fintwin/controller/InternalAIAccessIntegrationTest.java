package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import com.fintwin.security.AiToolToken;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * /internal/ai has a public URL on App Service. The service key alone must not
 * read anyone's data: every call also needs a live tool token for that user.
 */
class InternalAIAccessIntegrationTest extends AbstractIntegrationTest {

    @Autowired private AiToolToken toolTokens;

    private ResponseEntity<String> budgets(Long userId, String key, String token) {
        HttpHeaders h = new HttpHeaders();
        if (key != null) h.set("X-Internal-Key", key);
        if (token != null) h.set("X-Tool-Token", token);
        return restTemplate.exchange(baseUrl() + "/internal/ai/" + userId + "/budgets",
                HttpMethod.GET, new HttpEntity<>(h), String.class);
    }

    private Long user(String email) {
        seedUserAndGetToken(email, "Test@1234");
        return userRepository.findByEmail(email).orElseThrow().getId();
    }

    @Test
    void keyAndTokenForTheSameUserGetsTheData() {
        Long id = user("internal-ok@example.com");
        assertThat(budgets(id, "test-internal-key", toolTokens.mint(id)).getStatusCode())
                .isEqualTo(HttpStatus.OK);
    }

    @Test
    void theKeyAloneIsNotEnough() {
        Long id = user("internal-keyonly@example.com");
        assertThat(budgets(id, "test-internal-key", null).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void aTokenForOneUserCannotReadAnother() {
        Long alice = user("internal-alice@example.com");
        Long bob = user("internal-bob@example.com");
        assertThat(budgets(bob, "test-internal-key", toolTokens.mint(alice)).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void aWrongKeyIsRefusedEvenWithAToken() {
        Long id = user("internal-badkey@example.com");
        assertThat(budgets(id, "wrong-key", toolTokens.mint(id)).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
