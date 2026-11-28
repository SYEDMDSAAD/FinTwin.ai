package com.fintwin.security;

import com.fintwin.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A path that doesn't exist is a 404, even for a signed-in user. It used to
 * come back 401 (the error re-dispatch ran without the JWT filter), and the
 * app treats a 401 as "your session ended" — so one missing endpoint, say a
 * new page talking to an older backend, signed people out.
 */
class MissingPathIntegrationTest extends AbstractIntegrationTest {

    @Test
    void aMissingPathIsNotFoundNotUnauthorised() {
        String token = seedUserAndGetToken("missing-path@test.local", "Str0ng!Passw0rd");
        ResponseEntity<String> res = restTemplate.exchange(baseUrl() + "/api/v1/discover/no-such-thing",
                HttpMethod.GET, new HttpEntity<>(authHeaders(token)), String.class);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void withoutATokenItIsStillUnauthorised() {
        ResponseEntity<String> res = restTemplate.getForEntity(baseUrl() + "/api/v1/portfolio", String.class);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
