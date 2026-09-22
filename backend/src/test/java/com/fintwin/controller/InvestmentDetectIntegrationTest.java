package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import com.fintwin.repository.TransactionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Payments the user filed under Investments are offered as holdings, not just the ones a keyword knows. */
class InvestmentDetectIntegrationTest extends AbstractIntegrationTest {

    @Autowired private TransactionRepository transactions;

    private HttpEntity<Object> json(String token, Object body) {
        HttpHeaders h = authHeaders(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, h);
    }

    @Test
    void theUsersOwnCategoryCountsAsEvidence() {
        String token = seedUserAndGetToken("detect-user@example.com", "Test@1234");
        LocalDate today = LocalDate.now();

        restTemplate.exchange(baseUrl() + "/api/v1/transactions/batch?accountType=BANK", HttpMethod.POST, json(token, List.of(
                // a broker the keywords already know
                Map.of("date", today.minusMonths(2).toString(), "merchant", "UPI/DR/ZERODHA BROKING", "amount", -5000),
                // a payee no keyword knows — only the user's category says what it is
                Map.of("date", today.minusMonths(2).toString(), "merchant", "Paid to SARA CAPITAL SERVICES", "amount", -3000),
                Map.of("date", today.minusMonths(1).toString(), "merchant", "Paid to SARA CAPITAL SERVICES", "amount", -2000),
                // ordinary spending stays out of it
                Map.of("date", today.toString(), "merchant", "Paid to SWIGGY", "amount", -300))), Map.class);

        var user = userRepository.findByEmail("detect-user@example.com").orElseThrow();
        var sara = transactions.findByUser(user).stream()
                .filter(t -> t.getMerchant().contains("SARA")).findFirst().orElseThrow();
        restTemplate.exchange(baseUrl() + "/api/v1/transactions/" + sara.getId() + "/category", HttpMethod.PATCH,
                json(token, Map.of("category", "Investments", "applyToSimilar", true)), Map.class);

        List<Map> found = restTemplate.exchange(baseUrl() + "/api/v1/portfolio/auto-detect",
                HttpMethod.GET, json(token, null), List.class).getBody();

        assertThat(found).extracting(m -> m.get("name")).contains("SARA CAPITAL SERVICES");
        Map suggestion = found.stream().filter(m -> "SARA CAPITAL SERVICES".equals(m.get("name"))).findFirst().orElseThrow();
        assertThat(suggestion).containsEntry("investedAmount", 5000.0)      // both payments together
                .containsEntry("payments", 2)
                .containsEntry("type", "Other");                            // the user links it to a fund or stock
        assertThat(suggestion.get("purchaseDate")).isEqualTo(today.minusMonths(2).toString());

        assertThat(found).anySatisfy(m -> {
            assertThat(m).containsEntry("type", "Stocks");                  // keyword detection still works
            assertThat((String) m.get("name")).contains("Zerodha");
        });
        assertThat(found).noneSatisfy(m -> assertThat((String) m.get("name")).contains("SWIGGY"));

        // Each payment comes through on its own: two payments to one payee can be
        // two different investments, and only the user can say which
        assertThat((List<Map>) suggestion.get("breakdown")).containsExactly(
                Map.of("date", today.minusMonths(2).toString(), "amount", 3000.0),
                Map.of("date", today.minusMonths(1).toString(), "amount", 2000.0));
    }
}
