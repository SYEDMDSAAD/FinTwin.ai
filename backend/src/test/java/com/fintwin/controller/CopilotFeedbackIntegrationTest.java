package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import com.fintwin.model.ChatHistory;
import com.fintwin.repository.ChatHistoryRepository;
import com.fintwin.repository.CopilotFeedbackRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Rating a copilot answer keeps it, with how it was produced, past the chat-history trim. */
class CopilotFeedbackIntegrationTest extends AbstractIntegrationTest {

    @Autowired private ChatHistoryRepository chats;
    @Autowired private CopilotFeedbackRepository feedback;

    private HttpEntity<Object> json(String token, Object body) {
        HttpHeaders h = authHeaders(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, h);
    }

    private Long exchange(String email, String question, String answer) {
        ChatHistory c = new ChatHistory();
        c.setUser(userRepository.findByEmail(email).orElseThrow());
        c.setRole("user");
        c.setMessage(question);
        c.setReply(answer);
        c.setTrace("{\"path\":\"tools\",\"tools\":[{\"name\":\"get_budgets\"}],\"mode\":\"Budget Coach\"}");
        c.setTimestamp(LocalDateTime.now());
        return chats.save(c).getId();
    }

    private String rateUrl(Long id) {
        return baseUrl() + "/api/v1/transactions/chat/history/" + id + "/rating";
    }

    @Test
    void aRatingIsKeptWithItsTraceAndCanBeTakenBack() {
        String email = "copilot-rater@example.com";
        String token = seedUserAndGetToken(email, "Test@1234");
        Long id = exchange(email, "am I within budget?", "You have no budgets yet.");

        ResponseEntity<Map> r = restTemplate.exchange(rateUrl(id), HttpMethod.PUT,
                json(token, Map.of("rating", -1, "reason", "DIDNT_ANSWER")), Map.class);
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.OK);

        var user = userRepository.findByEmail(email).orElseThrow();
        var f = feedback.findByUserAndExchangeId(user, id).orElseThrow();
        assertThat(f.getQuestion()).isEqualTo("am I within budget?");
        assertThat(f.getPath()).isEqualTo("tools");
        assertThat(f.getMode()).isEqualTo("Budget Coach");
        assertThat(f.getReason()).isEqualTo("DIDNT_ANSWER");

        // the history shows it rated
        List<Map> history = restTemplate.exchange(baseUrl() + "/api/v1/transactions/chat/history",
                HttpMethod.GET, json(token, null), List.class).getBody();
        assertThat(history.get(1)).containsEntry("rating", -1);

        // the rating survives the trim of the chat history row
        chats.deleteById(id);
        assertThat(feedback.findByUserAndExchangeId(user, id)).isPresent();

        // taking a rating back removes the feedback
        Long id2 = exchange(email, "q2", "a2");
        restTemplate.exchange(rateUrl(id2), HttpMethod.PUT, json(token, Map.of("rating", 1)), Map.class);
        restTemplate.exchange(rateUrl(id2), HttpMethod.PUT, json(token, Map.of("rating", 0)), Map.class);
        assertThat(feedback.findByUserAndExchangeId(user, id2)).isEmpty();
    }

    @Test
    void deletingTheExchangeDeletesItsFeedback() {
        String email = "copilot-deleter@example.com";
        String token = seedUserAndGetToken(email, "Test@1234");
        Long id = exchange(email, "q", "a");
        restTemplate.exchange(rateUrl(id), HttpMethod.PUT, json(token, Map.of("rating", 1)), Map.class);

        restTemplate.exchange(baseUrl() + "/api/v1/transactions/chat/history/" + id, HttpMethod.DELETE, json(token, null), Map.class);

        assertThat(feedback.findByUserAndExchangeId(userRepository.findByEmail(email).orElseThrow(), id)).isEmpty();
    }

    @Test
    void onlyTheOwnerCanRateAndOnlyKnownReasonsAreAccepted() {
        String owner = seedUserAndGetToken("copilot-owner@example.com", "Test@1234");
        String other = seedUserAndGetToken("copilot-other@example.com", "Test@1234");
        Long id = exchange("copilot-owner@example.com", "q", "a");

        assertThat(restTemplate.exchange(rateUrl(id), HttpMethod.PUT, json(other, Map.of("rating", 1)), String.class)
                .getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(restTemplate.exchange(rateUrl(id), HttpMethod.PUT, json(owner, Map.of("rating", 5)), String.class)
                .getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(restTemplate.exchange(rateUrl(id), HttpMethod.PUT, json(owner, Map.of("rating", -1, "reason", "RUDE")), String.class)
                .getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void adminsSeeStatsButOnlyConsentingUsersAnswers() {
        String email = "copilot-noconsent@example.com";
        String token = seedUserAndGetToken(email, "Test@1234");
        String admin = seedAdminAndGetToken("copilot-admin@example.com", "Test@1234");
        Long id = exchange(email, "private question", "a");
        restTemplate.exchange(rateUrl(id), HttpMethod.PUT, json(token, Map.of("rating", -1, "reason", "WRONG_NUMBERS")), Map.class);

        String url = baseUrl() + "/api/v1/admin/copilot/feedback-stats";
        assertThat(restTemplate.exchange(url, HttpMethod.GET, json(token, null), String.class).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
        Map stats = restTemplate.exchange(url, HttpMethod.GET, json(admin, null), Map.class).getBody();
        assertThat(((Number) stats.get("notHelpful")).intValue()).isGreaterThanOrEqualTo(1);
        assertThat((List<Map>) stats.get("recentNotHelpful"))
                .noneMatch(m -> "private question".equals(m.get("question")));

        restTemplate.exchange(baseUrl() + "/api/v1/profile/training-consent", HttpMethod.PUT, json(token, Map.of("given", true)), Map.class);
        stats = restTemplate.exchange(url, HttpMethod.GET, json(admin, null), Map.class).getBody();
        assertThat((List<Map>) stats.get("recentNotHelpful"))
                .anyMatch(m -> "private question".equals(m.get("question")));
    }
}
