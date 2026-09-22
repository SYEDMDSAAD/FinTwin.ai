package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** A holding built from several payments can be taken apart again. */
class InvestmentSplitIntegrationTest extends AbstractIntegrationTest {

    private HttpEntity<Object> json(String token, Object body) {
        HttpHeaders h = authHeaders(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, h);
    }

    @Test
    void oneLumpSumBecomesOneHoldingPerPayment() {
        String token = seedUserAndGetToken("split-user@example.com", "Test@1234");
        LocalDate today = LocalDate.now();
        restTemplate.exchange(baseUrl() + "/api/v1/transactions/batch?accountType=BANK", HttpMethod.POST, json(token, List.of(
                Map.of("date", today.minusMonths(2).toString(), "merchant", "Paid to ABC SECURITIES", "amount", -3000),
                Map.of("date", today.minusMonths(1).toString(), "merchant", "Paid to ABC SECURITIES", "amount", -2000),
                Map.of("date", today.toString(), "merchant", "Paid to ABC SECURITIES", "amount", -1500))), Map.class);

        // the merged holding, as it was added before this existed
        Map lump = restTemplate.exchange(baseUrl() + "/api/v1/portfolio", HttpMethod.POST, json(token, Map.of(
                "name", "ABC SECURITIES", "type", "Other", "investedAmount", 6500,
                "currentValue", 6500, "purchaseDate", today.minusMonths(2).toString())), Map.class).getBody();

        ResponseEntity<List> split = restTemplate.exchange(baseUrl() + "/api/v1/portfolio/" + lump.get("id") + "/split",
                HttpMethod.POST, json(token, null), List.class);
        assertThat(split.getStatusCode()).isEqualTo(HttpStatus.OK);

        List<Map> holdings = (List<Map>) restTemplate.exchange(baseUrl() + "/api/v1/portfolio", HttpMethod.GET,
                json(token, null), Map.class).getBody().get("holdings");
        assertThat(holdings).hasSize(3);
        assertThat(holdings).extracting(h -> h.get("investedAmount"))
                .containsExactlyInAnyOrder(3000.0, 2000.0, 1500.0);
        assertThat(holdings).allSatisfy(h ->
                assertThat((String) h.get("name")).startsWith("ABC SECURITIES · "));
        assertThat(holdings).extracting(h -> h.get("purchaseDate"))
                .contains(today.toString(), today.minusMonths(1).toString());
    }

    @Test
    void aSinglePaymentHasNothingToSplit() {
        String token = seedUserAndGetToken("split-single@example.com", "Test@1234");
        restTemplate.exchange(baseUrl() + "/api/v1/transactions/batch?accountType=BANK", HttpMethod.POST, json(token, List.of(
                Map.of("date", LocalDate.now().toString(), "merchant", "Paid to ONE OFF LTD", "amount", -1000))), Map.class);
        Map lump = restTemplate.exchange(baseUrl() + "/api/v1/portfolio", HttpMethod.POST, json(token, Map.of(
                "name", "ONE OFF LTD", "type", "Other", "investedAmount", 1000, "currentValue", 1000)), Map.class).getBody();

        ResponseEntity<String> resp = restTemplate.exchange(baseUrl() + "/api/v1/portfolio/" + lump.get("id") + "/split",
                HttpMethod.POST, json(token, null), String.class);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody()).contains("nothing to split");
    }

    @Test
    void anotherUsersHoldingCantBeSplit() {
        String owner = seedUserAndGetToken("split-owner@example.com", "Test@1234");
        String other = seedUserAndGetToken("split-other@example.com", "Test@1234");
        Map lump = restTemplate.exchange(baseUrl() + "/api/v1/portfolio", HttpMethod.POST, json(owner, Map.of(
                "name", "PRIVATE HOLDING", "type", "Other", "investedAmount", 500, "currentValue", 500)), Map.class).getBody();

        assertThat(restTemplate.exchange(baseUrl() + "/api/v1/portfolio/" + lump.get("id") + "/split",
                HttpMethod.POST, json(other, null), String.class).getStatusCode().is4xxClientError()).isTrue();
    }
}
