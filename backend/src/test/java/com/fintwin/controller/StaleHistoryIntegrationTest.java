package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import com.fintwin.dto.FinancialSummaryDTO;
import com.fintwin.model.User;
import com.fintwin.service.FinancialDataAggregatorService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A statement imported months after the fact ends in the past. "The last three
 * months" has to mean the user's newest three months of data, or every figure
 * reads zero and the copilot asks for numbers it already holds.
 */
class StaleHistoryIntegrationTest extends AbstractIntegrationTest {

    @Autowired private FinancialDataAggregatorService aggregator;

    private HttpEntity<Object> json(String token, Object body) {
        HttpHeaders h = authHeaders(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, h);
    }

    @Test
    void figuresComeFromTheNewestMonthsTheUserActuallyHas() {
        String email = "stale-history@example.com";
        String token = seedUserAndGetToken(email, "Test@1234");
        LocalDate ended = LocalDate.now().minusMonths(8);          // imported long after the fact

        restTemplate.exchange(baseUrl() + "/api/v1/transactions/batch?accountType=BANK", HttpMethod.POST, json(token, List.of(
                Map.of("date", ended.toString(), "merchant", "UPI/SWIGGY", "amount", -2000),
                Map.of("date", ended.minusMonths(1).toString(), "merchant", "NEFT CR-ACME-SALARY", "amount", 60000),
                Map.of("date", ended.minusMonths(14).toString(), "merchant", "UPI/OLD SHOP", "amount", -999))), Map.class);

        // The list the page shows isn't empty just because the data is old
        List<Map> shown = restTemplate.exchange(baseUrl() + "/api/v1/transactions",
                HttpMethod.GET, json(token, null), List.class).getBody();
        assertThat(shown).hasSize(2);                               // the two newest months, not the 14-month-old row

        // and the copilot's snapshot carries real figures, and says what they cover
        User user = userRepository.findByEmail(email).orElseThrow();
        FinancialSummaryDTO summary = aggregator.aggregate(user);
        assertThat(summary.getIncome()).isGreaterThan(0);
        assertThat(summary.getExpenses()).isGreaterThan(0);
        assertThat(summary.getDataThrough()).isEqualTo(ended.toString());
        assertThat(summary.getDataFrom()).isEqualTo(ended.minusMonths(1).toString());
    }

    @Test
    void aUserWhoseDataReachesTodayIsUnaffected() {
        String email = "fresh-history@example.com";
        String token = seedUserAndGetToken(email, "Test@1234");
        restTemplate.exchange(baseUrl() + "/api/v1/transactions/batch?accountType=BANK", HttpMethod.POST, json(token, List.of(
                Map.of("date", LocalDate.now().toString(), "merchant", "UPI/SWIGGY", "amount", -300),
                Map.of("date", LocalDate.now().minusMonths(5).toString(), "merchant", "UPI/OLD", "amount", -400))), Map.class);

        List<Map> shown = restTemplate.exchange(baseUrl() + "/api/v1/transactions",
                HttpMethod.GET, json(token, null), List.class).getBody();
        assertThat(shown).hasSize(1);                               // still the last three calendar months
    }
}
