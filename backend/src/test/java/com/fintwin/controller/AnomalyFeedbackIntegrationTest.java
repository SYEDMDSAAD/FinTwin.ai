package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import com.fintwin.model.AnomalyFeedback;
import com.fintwin.repository.AnomalyFeedbackRepository;
import com.fintwin.repository.DismissedAnomalyRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Anomaly verdicts are kept with the figures that raised the alert. */
class AnomalyFeedbackIntegrationTest extends AbstractIntegrationTest {

    @Autowired private AnomalyFeedbackRepository feedback;
    @Autowired private DismissedAnomalyRepository dismissed;

    private HttpEntity<Object> json(String token, Object body) {
        HttpHeaders h = authHeaders(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, h);
    }

    private static final Map<String, Object> ALERT = Map.of(
            "type", "merchant_spike", "merchant", "Paid to SWIGGY", "category", "Food",
            "amount", 2400.0, "avgAmount", 450.0, "multiplier", 5.3, "severity", "high");

    @Test
    void confirmingKeepsTheAlertAndChangingYourMindUpdatesTheSameRow() {
        String email = "anomaly-rater@example.com";
        String token = seedUserAndGetToken(email, "Test@1234");
        var user = userRepository.findByEmail(email).orElseThrow();

        assertThat(restTemplate.exchange(baseUrl() + "/api/v1/anomalies/confirm", HttpMethod.POST, json(token, ALERT), Void.class)
                .getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        List<AnomalyFeedback> rows = feedback.findAll().stream().filter(f -> f.getUser().getId().equals(user.getId())).toList();
        assertThat(rows).hasSize(1);
        AnomalyFeedback f = rows.get(0);
        assertThat(f.getVerdict()).isEqualTo(AnomalyFeedback.CONFIRMED);
        assertThat(f.getMerchant()).isEqualTo("Paid to SWIGGY");
        assertThat(f.getAmount()).isEqualByComparingTo("2400");
        assertThat(f.getMultiplier()).isEqualTo(5.3);
        assertThat(dismissed.findByUser(user)).isEmpty();          // confirming doesn't hide it

        restTemplate.exchange(baseUrl() + "/api/v1/anomalies/dismiss", HttpMethod.POST, json(token, ALERT), Void.class);
        rows = feedback.findAll().stream().filter(x -> x.getUser().getId().equals(user.getId())).toList();
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getVerdict()).isEqualTo(AnomalyFeedback.NOT_ANOMALY);
        assertThat(dismissed.findByUser(user)).hasSize(1);        // dismissing still suppresses it
    }

    @Test
    void onlyAdminsSeeTheFalseAlarmRate() {
        String token = seedUserAndGetToken("anomaly-plain@example.com", "Test@1234");
        String admin = seedAdminAndGetToken("anomaly-admin@example.com", "Test@1234");
        restTemplate.exchange(baseUrl() + "/api/v1/anomalies/dismiss", HttpMethod.POST, json(token, ALERT), Void.class);

        String url = baseUrl() + "/api/v1/admin/anomalies/feedback-stats";
        assertThat(restTemplate.exchange(url, HttpMethod.GET, json(token, null), String.class).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
        Map stats = restTemplate.exchange(url, HttpMethod.GET, json(admin, null), Map.class).getBody();
        assertThat(((Number) stats.get("falseAlarms")).intValue()).isGreaterThanOrEqualTo(1);
        assertThat((List<Map>) stats.get("byType")).anyMatch(m -> "merchant_spike".equals(m.get("type")));
    }
}
