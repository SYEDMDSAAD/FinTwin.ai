package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Statement formats are grouped by header row, with how often users fixed the columns. */
class ImportFeedbackIntegrationTest extends AbstractIntegrationTest {

    private HttpEntity<Object> json(String token, Object body) {
        HttpHeaders h = authHeaders(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, h);
    }

    private Map<String, Object> event(List<String> headers, Map<String, Object> detected, Map<String, Object> fin) {
        return Map.of("headers", headers, "detected", detected, "final", fin, "fileType", "pdf",
                "detectedFormat", "table", "rows", 120);
    }

    @Test
    void formatsAreCountedByHeaderRowAndHandFixesStandOut() {
        String a = seedUserAndGetToken("import-a@example.com", "Test@1234");
        String b = seedUserAndGetToken("import-b@example.com", "Test@1234");
        String admin = seedAdminAndGetToken("import-admin@example.com", "Test@1234");
        String url = baseUrl() + "/api/v1/imports/mapping-feedback";

        List<String> phonepe = List.of("Date", "Transaction Details", "Type", "Amount");
        Map<String, Object> guess = Map.of("date", "Date", "merchant", "Transaction Details", "amount", "Amount");
        Map<String, Object> fixed = Map.of("date", "Date", "merchant", "Transaction Details", "amount", "Amount", "direction", "Type");

        Map r1 = restTemplate.exchange(url, HttpMethod.POST, json(a, event(phonepe, guess, fixed)), Map.class).getBody();
        assertThat(r1).containsEntry("changed", true);
        // same format, capitalised differently, read right first time
        Map r2 = restTemplate.exchange(url, HttpMethod.POST,
                json(b, event(List.of("DATE", "transaction  details", "TYPE", "AMOUNT"), fixed, fixed)), Map.class).getBody();
        assertThat(r2).containsEntry("changed", false);

        List<Map> formats = restTemplate.exchange(baseUrl() + "/api/v1/admin/imports/formats",
                HttpMethod.GET, json(admin, null), List.class).getBody();
        Map f = formats.stream().filter(m -> ((List) m.get("headers")).contains("Type") || ((List) m.get("headers")).contains("TYPE"))
                .findFirst().orElseThrow();
        assertThat(f).containsEntry("imports", 2).containsEntry("users", 2).containsEntry("fixedByHand", 1)
                .containsEntry("fixRate", 50.0);

        assertThat(restTemplate.exchange(baseUrl() + "/api/v1/admin/imports/formats", HttpMethod.GET, json(a, null), String.class)
                .getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void headersWithoutARowAreRejectedAndNumbersNeverStored() {
        String a = seedUserAndGetToken("import-c@example.com", "Test@1234");
        String admin = seedAdminAndGetToken("import-admin2@example.com", "Test@1234");
        String url = baseUrl() + "/api/v1/imports/mapping-feedback";

        assertThat(restTemplate.exchange(url, HttpMethod.POST, json(a, Map.of("headers", List.of())), String.class)
                .getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        restTemplate.exchange(url, HttpMethod.POST, json(a, event(List.of("Txn Date", "A/c 50100123456789", "Amt"),
                Map.of("date", "Txn Date"), Map.of("date", "Txn Date", "amount", "Amt"))), Map.class);
        List<Map> formats = restTemplate.exchange(baseUrl() + "/api/v1/admin/imports/formats",
                HttpMethod.GET, json(admin, null), List.class).getBody();
        assertThat(formats.toString()).doesNotContain("50100123456789").contains("A/c #");
    }
}
