package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import com.fintwin.model.Transaction;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.util.Categorized;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;

import java.util.Comparator;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Imported transactions carry how they were categorised; user changes are recorded against it. */
class CategoryLabelIntegrationTest extends AbstractIntegrationTest {

    @Autowired private TransactionRepository transactions;

    private HttpEntity<Object> json(String token, Object body) {
        HttpHeaders h = authHeaders(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, h);
    }

    private List<Transaction> rowsOf(String email) {
        var user = userRepository.findByEmail(email).orElseThrow();
        return transactions.findByUser(user).stream()
                .sorted(Comparator.comparing(Transaction::getId)).toList();
    }

    @Test
    void importsRecordTheRuleAndCorrectionsKeepThePrediction() {
        String email = "labels-user@example.com";
        String token = seedUserAndGetToken(email, "Test@1234");
        List<Map<String, Object>> rows = List.of(
                Map.of("date", "2026-09-01", "merchant", "Paid to SPOTIFY INDIA PVT LTD", "amount", -119),
                Map.of("date", "2026-09-02", "merchant", "Paid to SARA ENTERPRISES", "amount", -800),
                Map.of("date", "2026-09-03", "merchant", "Paid to SARA ENTERPRISES", "amount", -450));
        restTemplate.exchange(baseUrl() + "/api/v1/transactions/batch?accountType=BANK",
                HttpMethod.POST, json(token, rows), Map.class);

        List<Transaction> saved = rowsOf(email);
        assertThat(saved).extracting(Transaction::getCategorySource)
                .containsExactly(Categorized.BRAND, Categorized.NONE, Categorized.NONE);
        assertThat(saved.get(0).getPredictedCategory()).isEqualTo("Entertainment");

        // Correct one SARA row and apply it to the other
        ResponseEntity<Map> patched = restTemplate.exchange(
                baseUrl() + "/api/v1/transactions/" + saved.get(1).getId() + "/category", HttpMethod.PATCH,
                json(token, Map.of("category", "Groceries", "applyToSimilar", true)), Map.class);
        assertThat(patched.getStatusCode()).isEqualTo(HttpStatus.OK);

        List<Transaction> after = rowsOf(email);
        assertThat(after.get(1)).satisfies(t -> {
            assertThat(t.getCategory()).isEqualTo("Groceries");
            assertThat(t.getPredictedCategory()).isEqualTo("Other");
            assertThat(t.getCategoryReview()).isEqualTo(Categorized.CORRECTED);
        });
        assertThat(after.get(2).getCategoryReview()).isEqualTo(Categorized.APPLIED);

        // Keeping Spotify where it was confirms the prediction
        restTemplate.exchange(baseUrl() + "/api/v1/transactions/" + saved.get(0).getId() + "/category", HttpMethod.PATCH,
                json(token, Map.of("category", "Entertainment")), Map.class);
        assertThat(rowsOf(email).get(0).getCategoryReview()).isEqualTo(Categorized.CONFIRMED);
    }

    @Test
    void trainingConsentIsOffUntilTheUserTurnsItOn() {
        String token = seedUserAndGetToken("labels-consent@example.com", "Test@1234");
        String url = baseUrl() + "/api/v1/profile/training-consent";

        assertThat(restTemplate.exchange(url, HttpMethod.GET, json(token, null), Map.class).getBody())
                .containsEntry("given", false);
        Map on = restTemplate.exchange(url, HttpMethod.PUT, json(token, Map.of("given", true)), Map.class).getBody();
        assertThat(on).containsEntry("given", true);
        assertThat(on.get("givenAt")).isNotNull();
        assertThat(restTemplate.exchange(url, HttpMethod.PUT, json(token, Map.of("given", false)), Map.class).getBody())
                .containsEntry("given", false);
        assertThat(restTemplate.exchange(url, HttpMethod.PUT, json(token, Map.of("given", "yes")), String.class)
                .getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void onlyAdminsSeeTheStats() {
        String user = seedUserAndGetToken("labels-plain@example.com", "Test@1234");
        String admin = seedAdminAndGetToken("labels-admin@example.com", "Test@1234");
        String url = baseUrl() + "/api/v1/admin/categorization/stats";

        assertThat(restTemplate.exchange(url, HttpMethod.GET, json(user, null), String.class).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
        ResponseEntity<Map> stats = restTemplate.exchange(url, HttpMethod.GET, json(admin, null), Map.class);
        assertThat(stats.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(stats.getBody()).containsKeys("methods", "trainingReadyLabels", "usersConsentedToTraining");
    }
}
