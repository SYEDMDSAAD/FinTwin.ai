package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.actuate.observability.AutoConfigureObservability;
import org.springframework.http.*;

import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

/** /actuator/prometheus is public on App Service, so it takes METRICS_TOKEN, and exports few series per endpoint. */
@AutoConfigureObservability   // tests switch metrics export off by default; this endpoint is the subject
class MetricsEndpointIntegrationTest extends AbstractIntegrationTest {

    private ResponseEntity<String> scrape(String authorization) {
        HttpHeaders h = new HttpHeaders();
        if (authorization != null) h.set("Authorization", authorization);
        return restTemplate.exchange(baseUrl() + "/actuator/prometheus", HttpMethod.GET, new HttpEntity<>(h), String.class);
    }

    @Test
    void scrapeWithoutTheTokenIsRefused() {
        assertThat(scrape(null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(scrape("Bearer wrong").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        // a user's JWT is not a scrape token
        String jwt = seedUserAndGetToken("metrics-snoop@example.com", "Test@1234");
        assertThat(scrape("Bearer " + jwt).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void scrapeWithTheTokenGetsFixedLatencyBuckets() {
        restTemplate.getForEntity(baseUrl() + "/actuator/health", String.class);   // one request to measure

        ResponseEntity<String> r = scrape("Bearer test-metrics-token");
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.OK);

        String body = r.getBody();
        String anyHealthCount = Arrays.stream(body.split("\n"))
                .filter(l -> l.startsWith("http_server_requests_seconds_count{") && l.contains("uri=\"/actuator/health\""))
                .findFirst().orElseThrow();
        String labels = anyHealthCount.substring(anyHealthCount.indexOf('{') + 1, anyHealthCount.indexOf('}'));
        long buckets = Arrays.stream(body.split("\n"))
                .filter(l -> l.startsWith("http_server_requests_seconds_bucket{") && l.contains(labels.split(",le=")[0]))
                .filter(l -> l.contains("uri=\"/actuator/health\"") && l.contains(statusOf(labels)))
                .count();
        // the 10 SLO buckets + Inf, not the ~74 of a full histogram
        assertThat(buckets).isBetween(10L, 12L);
    }

    private static String statusOf(String labels) {
        return Arrays.stream(labels.split(",")).filter(l -> l.startsWith("status=")).findFirst().orElseThrow();
    }
}
