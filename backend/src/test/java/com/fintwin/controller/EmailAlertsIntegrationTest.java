package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The alert-email routes through the real security chain and database: the
 * public webhook must be reachable without a JWT (and guarded by its own
 * signature instead), and the user-facing routes must still require one.
 */
class EmailAlertsIntegrationTest extends AbstractIntegrationTest {

    private static final String SECRET = "integration-test-inbound-secret-0123456789";

    private static String sign(String timestamp, String body) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal((timestamp + "." + body).getBytes(StandardCharsets.UTF_8)));
    }

    private ResponseEntity<Map> postWebhook(String body, String timestamp, String signature) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        if (timestamp != null) h.set("X-FinTwin-Timestamp", timestamp);
        if (signature != null) h.set("X-FinTwin-Signature", signature);
        return restTemplate.postForEntity(baseUrl() + "/api/v1/inbound/email", new HttpEntity<>(body, h), Map.class);
    }

    @Test
    void webhookIsReachableWithoutAJwtButRefusesAnUnsignedCall() {
        ResponseEntity<Map> resp = postWebhook("{\"recipient\":\"x\",\"raw\":\"\"}", null, null);
        // 401 from the signature check — not 403 from the JWT filter
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void aSignedCallForAnUnknownAddressIsAcceptedAndDropped() throws Exception {
        String body = "{\"recipient\":\"u-ffffffffffffffffffff@in.fintwin.test\",\"raw\":\"RnJvbTogeEB5\"}";
        String ts = Long.toString(Instant.now().getEpochSecond());

        ResponseEntity<Map> resp = postWebhook(body, ts, sign(ts, body));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void theUserGetsAStableAddressAndCanReplaceIt() {
        String token = seedUserAndGetToken("alerts-user@example.com", "Test@1234");
        HttpEntity<Void> auth = new HttpEntity<>(authHeaders(token));

        Map first = restTemplate.exchange(baseUrl() + "/api/v1/email-alerts", HttpMethod.GET, auth, Map.class).getBody();
        Map again = restTemplate.exchange(baseUrl() + "/api/v1/email-alerts", HttpMethod.GET, auth, Map.class).getBody();
        Map rotated = restTemplate.exchange(baseUrl() + "/api/v1/email-alerts/rotate", HttpMethod.POST, auth, Map.class).getBody();

        assertThat(first.get("enabled")).isEqualTo(true);
        assertThat((String) first.get("address")).matches("u-[0-9a-f]{20}@in\\.fintwin\\.test");
        assertThat(again.get("address")).isEqualTo(first.get("address"));
        assertThat(rotated.get("address")).isNotEqualTo(first.get("address"));
    }

    @Test
    void userRoutesStillNeedAJwt() {
        assertThat(restTemplate.getForEntity(baseUrl() + "/api/v1/email-alerts", String.class).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(restTemplate.getForEntity(baseUrl() + "/api/v1/data-coverage", String.class).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void coverageListsImportedAccounts() {
        String token = seedUserAndGetToken("coverage-user@example.com", "Test@1234");
        HttpHeaders h = authHeaders(token);
        h.setContentType(MediaType.APPLICATION_JSON);

        List<Map<String, Object>> rows = List.of(Map.of("date", "2026-08-05", "merchant", "UPI/SWIGGY", "amount", -450.0));
        restTemplate.exchange(baseUrl() + "/api/v1/transactions/batch?accountType=BANK&account=HDFC ··1234",
                HttpMethod.POST, new HttpEntity<>(rows, h), Map.class);

        ResponseEntity<List> resp = restTemplate.exchange(baseUrl() + "/api/v1/data-coverage",
                HttpMethod.GET, new HttpEntity<>(authHeaders(token)), List.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((List<Map<String, Object>>) resp.getBody())
                .extracting(m -> m.get("account")).containsExactly("HDFC ··1234");
    }
}
