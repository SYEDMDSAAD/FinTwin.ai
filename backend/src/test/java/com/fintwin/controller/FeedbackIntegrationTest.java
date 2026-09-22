package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import com.fintwin.model.SupportTicket;
import com.fintwin.repository.SupportTicketRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Beta feedback lands in the admin's ticket queue under the signed-in user. */
class FeedbackIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private SupportTicketRepository tickets;

    private HttpEntity<Object> json(HttpHeaders h, Object body) {
        h.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, h);
    }

    @Test
    void feedbackIsFiledUnderTheSessionUserNotWhateverTheBodySays() {
        String token = seedUserAndGetToken("beta-tester@example.com", "Test@1234");
        Map<String, Object> body = Map.of("rating", 4, "useful", List.of("Dashboard", "Imports"),
                "improve", "Support more banks", "email", "someone-else@example.com");

        ResponseEntity<Map> resp = restTemplate.exchange(baseUrl() + "/api/v1/feedback", HttpMethod.POST,
                json(authHeaders(token), body), Map.class);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);

        SupportTicket t = tickets.findById(((Number) resp.getBody().get("ticketId")).longValue()).orElseThrow();
        assertThat(t.getUserEmail()).isEqualTo("beta-tester@example.com");
        assertThat(t.getCategory()).isEqualTo("FEEDBACK");
        assertThat(t.getMessage()).startsWith("Rating: 4/5\nMost useful: Dashboard, Imports");
    }

    @Test
    void needsASignedInUserAndARating() {
        assertThat(restTemplate.exchange(baseUrl() + "/api/v1/feedback", HttpMethod.POST,
                json(new HttpHeaders(), Map.of("rating", 5)), String.class).getStatusCode().is4xxClientError()).isTrue();

        String token = seedUserAndGetToken("beta-norating@example.com", "Test@1234");
        assertThat(restTemplate.exchange(baseUrl() + "/api/v1/feedback", HttpMethod.POST,
                json(authHeaders(token), Map.of("improve", "x")), String.class).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }
}
