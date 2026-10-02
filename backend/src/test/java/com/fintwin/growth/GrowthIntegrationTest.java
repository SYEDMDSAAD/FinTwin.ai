package com.fintwin.growth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fintwin.AbstractIntegrationTest;
import com.fintwin.model.Transaction;
import com.fintwin.repository.TransactionRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Landing visitors, demo usage and the funnel, as the admin's Growth tab reads them. */
class GrowthIntegrationTest extends AbstractIntegrationTest {

    private static final String DESKTOP = "Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36";
    private static final String PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Mobile/15E148 Safari/604.1";
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired private TransactionRepository transactions;

    private int visit(String visitorId, String source, String agent) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        h.set("User-Agent", agent);
        Map<String, Object> body = source == null ? Map.of("visitorId", visitorId)
                : Map.of("visitorId", visitorId, "source", source);
        return restTemplate.exchange(baseUrl() + "/api/v1/visits", HttpMethod.POST,
                new HttpEntity<>(body, h), String.class).getStatusCode().value();
    }

    @Test
    @SuppressWarnings("unchecked")
    void theGrowthTabCountsVisitorsTheDemoAndTheFunnel() throws Exception {
        assertThat(visit("growth-visitor-0001", "LinkedIn.com", DESKTOP)).isEqualTo(204);
        visit("growth-visitor-0001", "linkedin.com", DESKTOP);      // came back: same visitor, two visits
        visit("growth-visitor-0002", null, PHONE);
        visit("growth-visitor-0003", null, "Googlebot/2.1 (+http://www.google.com/bot.html)");  // a bot
        visit("not ok!", null, DESKTOP);                           // malformed id

        // A new user who added data
        String userToken = seedUserAndGetToken("growth-new-user@example.com", "Test@1234");
        Transaction t = new Transaction();
        t.setUser(userRepository.findByEmail("growth-new-user@example.com").orElseThrow());
        t.setDate(LocalDate.now());
        t.setMerchant("Swiggy");
        t.setAmount(-250.0);
        t.setCategory("Food");
        transactions.save(t);

        String admin = seedAdminAndGetToken("growth-admin@example.com", "Test@1234");
        ResponseEntity<String> res = restTemplate.exchange(baseUrl() + "/api/v1/admin/growth?days=7",
                HttpMethod.GET, new HttpEntity<>(authHeaders(admin)), String.class);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        Map<String, Object> body = JSON.readValue(res.getBody(), Map.class);

        Map<String, Object> visitors = (Map<String, Object>) body.get("visitors");
        assertThat(visitors).containsEntry("visitors", 2).containsEntry("visits", 3);
        assertThat((List<Map<String, Object>>) visitors.get("sources"))
                .anySatisfy(s -> assertThat(s).containsEntry("source", "linkedin.com").containsEntry("visitors", 1));
        assertThat((List<Map<String, Object>>) visitors.get("devices"))
                .anySatisfy(d -> assertThat(d).containsEntry("device", "mobile").containsEntry("visitors", 1));

        Map<String, Object> funnel = (Map<String, Object>) body.get("funnel");
        assertThat(funnel).containsEntry("visitors", 2);
        assertThat(((Number) funnel.get("signedUp")).longValue()).isPositive();
        assertThat(((Number) funnel.get("addedData")).longValue()).isPositive();
        assertThat(body).containsKey("demo");

        // Users can't read it, and nobody without an account can
        assertThat(restTemplate.exchange(baseUrl() + "/api/v1/admin/growth", HttpMethod.GET,
                new HttpEntity<>(authHeaders(userToken)), String.class).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(restTemplate.getForEntity(baseUrl() + "/api/v1/admin/growth", String.class).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
