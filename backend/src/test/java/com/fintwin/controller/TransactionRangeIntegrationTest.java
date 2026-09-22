package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** The transactions list covers the window the page asks for, not always three months. */
class TransactionRangeIntegrationTest extends AbstractIntegrationTest {

    private HttpEntity<Object> json(String token, Object body) {
        HttpHeaders h = authHeaders(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, h);
    }

    private List<Map> list(String token, String query) {
        return restTemplate.exchange(baseUrl() + "/api/v1/transactions" + query,
                HttpMethod.GET, json(token, null), List.class).getBody();
    }

    @Test
    void twoYearsAreThereEvenThoughThreeMonthsIsTheDefault() {
        String token = seedUserAndGetToken("range-user@example.com", "Test@1234");
        LocalDate today = LocalDate.now();
        // one payment a month for two years
        List<Map<String, Object>> rows = new java.util.ArrayList<>();
        for (int back = 0; back < 24; back++) {
            LocalDate d = today.minusMonths(back).withDayOfMonth(15);
            rows.add(Map.of("date", d.toString(), "merchant", "Paid to SWIGGY", "amount", -100 - back));
        }
        restTemplate.exchange(baseUrl() + "/api/v1/transactions/batch?accountType=BANK", HttpMethod.POST,
                json(token, rows), Map.class);

        assertThat(list(token, "")).hasSize(3);                       // default: this month + 2
        assertThat(list(token, "?months=6")).hasSize(6);
        assertThat(list(token, "?months=12")).hasSize(12);
        assertThat(list(token, "?months=0")).hasSize(24);             // everything imported
        assertThat(list(token, "?months=0&category=Food")).hasSize(24);
        assertThat(list(token, "?months=0&category=Travel")).isEmpty();
    }

    @Test
    void categoryTotalsCoverTheSameWindow() {
        String token = seedUserAndGetToken("range-totals@example.com", "Test@1234");
        LocalDate today = LocalDate.now();
        restTemplate.exchange(baseUrl() + "/api/v1/transactions/batch?accountType=BANK", HttpMethod.POST, json(token, List.of(
                Map.of("date", today.withDayOfMonth(2).toString(), "merchant", "Paid to SWIGGY", "amount", -300),
                Map.of("date", today.withDayOfMonth(3).toString(), "merchant", "Paid to BLINKIT COMMERCE", "amount", -700),
                Map.of("date", today.minusMonths(18).withDayOfMonth(5).toString(), "merchant", "Paid to SWIGGY", "amount", -500),
                Map.of("date", today.withDayOfMonth(4).toString(), "merchant", "NEFT CR-ACME-SALARY", "amount", 50000))), Map.class);

        Map recent = restTemplate.exchange(baseUrl() + "/api/v1/transactions/category-totals",
                HttpMethod.GET, json(token, null), Map.class).getBody();
        assertThat((List<Map>) recent.get("categories"))
                .extracting(m -> m.get("category"), m -> m.get("total"))
                .containsExactly(org.assertj.core.groups.Tuple.tuple("Groceries", 700.0),
                                 org.assertj.core.groups.Tuple.tuple("Food", 300.0));

        Map all = restTemplate.exchange(baseUrl() + "/api/v1/transactions/category-totals?months=0",
                HttpMethod.GET, json(token, null), Map.class).getBody();
        assertThat((List<Map>) all.get("categories")).first()
                .satisfies(m -> assertThat(m).containsEntry("category", "Food").containsEntry("total", 800.0)
                        .containsEntry("count", 2));
        assertThat(all.get("from")).isEqualTo(today.minusMonths(18).withDayOfMonth(5).toString());
        assertThat(all.get("transactions")).isEqualTo(4);          // income counted in the range, not in a category
    }
}
