package com.fintwin.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fintwin.AbstractIntegrationTest;
import com.fintwin.model.ChatHistory;
import com.fintwin.model.Transaction;
import com.fintwin.repository.ChatHistoryRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.util.Categorized;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** The export holds opted-in users only, with nothing that identifies a person. */
class TrainingExportIntegrationTest extends AbstractIntegrationTest {

    @Autowired private ChatHistoryRepository chats;
    @Autowired private TransactionRepository transactions;
    @Autowired private ObjectMapper json;

    private HttpEntity<Object> body(String token, Object body) {
        HttpHeaders h = authHeaders(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, h);
    }

    /** A user with a statement, a rated answer, an anomaly verdict and an import report. */
    private String userWithData(String email, boolean consent) {
        String token = seedUserAndGetToken(email, "Test@1234");
        restTemplate.exchange(baseUrl() + "/api/v1/transactions/batch?accountType=BANK", HttpMethod.POST, body(token, List.of(
                Map.of("date", "2026-09-01", "merchant", "Paid to SPOTIFY INDIA PVT LTD", "amount", -119),
                Map.of("date", "2026-09-02", "merchant", "Paid to RAHUL KUMAR SHARMA", "amount", -2500),
                Map.of("date", "2026-09-03", "merchant", "UPI/DR/4123456789/9876543210@ybl", "amount", -300))), Map.class);

        var user = userRepository.findByEmail(email).orElseThrow();
        Transaction sandbox = new Transaction();                     // Setu sandbox row: never exported
        sandbox.setUser(user);
        sandbox.setDate(LocalDate.of(2026, 9, 4));
        sandbox.setMerchant("SANDBOX NARRATION");
        sandbox.setAmount(-50.0);
        sandbox.setSource("BANK");
        sandbox.applyPrediction(new Categorized("Food", Categorized.BANK_KEYWORD));
        transactions.save(sandbox);

        ChatHistory c = new ChatHistory();
        c.setUser(user);
        c.setRole("user");
        c.setMessage("How much did I send Rahul? Call me on 9123456780");
        c.setReply("You sent Rahul ₹2,500 via 9876543210@ybl.");
        c.setTrace("{\"path\":\"tools\"}");
        c.setTimestamp(LocalDateTime.now());
        Long id = chats.save(c).getId();
        restTemplate.exchange(baseUrl() + "/api/v1/transactions/chat/history/" + id + "/rating", HttpMethod.PUT,
                body(token, Map.of("rating", -1, "reason", "WRONG_NUMBERS")), Map.class);

        restTemplate.exchange(baseUrl() + "/api/v1/anomalies/confirm", HttpMethod.POST, body(token, Map.of(
                "type", "merchant_spike", "merchant", "Paid to RAHUL KUMAR SHARMA", "amount", 2500.0,
                "avgAmount", 480.0, "multiplier", 5.2, "severity", "high")), Void.class);

        restTemplate.exchange(baseUrl() + "/api/v1/imports/mapping-feedback", HttpMethod.POST, body(token, Map.of(
                "headers", List.of("Date", "Details", "Amount"), "detected", Map.of("date", "Date"),
                "final", Map.of("date", "Date", "amount", "Amount"), "fileType", "csv", "rows", 3)), Map.class);

        if (consent) restTemplate.exchange(baseUrl() + "/api/v1/profile/training-consent", HttpMethod.PUT,
                body(token, Map.of("given", true)), Map.class);
        return token;
    }

    private List<Map> export(String admin, String dataset) throws Exception {
        ResponseEntity<String> r = restTemplate.exchange(baseUrl() + "/api/v1/admin/training-export/" + dataset,
                HttpMethod.GET, body(admin, null), String.class);
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(r.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION)).contains("fintwin-" + dataset);
        if (r.getBody() == null) return List.of();
        return Arrays.stream(r.getBody().split("\n")).filter(s -> !s.isBlank())
                .map(s -> { try { return json.readValue(s, Map.class); } catch (Exception e) { throw new RuntimeException(e); } })
                .toList();
    }

    @Test
    void exportsOnlyOptedInUsersWithNothingIdentifying() throws Exception {
        userWithData("export-yes@example.com", true);
        userWithData("export-no@example.com", false);
        String admin = seedAdminAndGetToken("export-admin@example.com", "Test@1234");

        // Other test classes share this database, so find this test's users by their data
        List<Map> allChat = export(admin, "copilot");
        String me = allChat.stream().filter(m -> String.valueOf(m.get("question")).startsWith("How much did I send"))
                .map(m -> (String) m.get("user")).findFirst().orElseThrow();
        assertThat(allChat.stream().filter(m -> String.valueOf(m.get("question")).startsWith("How much did I send")))
                .hasSize(1);                                           // the user who didn't opt in isn't there
        assertThat(me).startsWith("u_");

        List<Map> cats = mine(export(admin, "categories"), me);
        List<Map> chat = mine(allChat, me);
        List<Map> anom = mine(export(admin, "anomalies"), me);
        List<Map> imps = mine(export(admin, "imports"), me);

        assertThat(cats).hasSize(3);                                   // sandbox row left out
        assertThat(chat).hasSize(1);
        assertThat(anom).hasSize(1);
        assertThat(imps).hasSize(1);

        String all = json.writeValueAsString(List.of(cats, chat, anom, imps));
        assertThat(all).doesNotContain("RAHUL", "Rahul", "9876543210", "9123456780", "4123456789", "SANDBOX",
                "export-yes", "@example.com");

        assertThat(cats).extracting(m -> m.get("merchant")).contains("Paid to SPOTIFY INDIA PVT LTD", "Paid to <PERSON>");
        assertThat(cats.get(0)).containsEntry("method", "BRAND").containsEntry("category", "Entertainment")
                .containsEntry("direction", "out").containsEntry("amount", 120.0);
        assertThat(chat.get(0).get("question")).isEqualTo("How much did I send <PERSON>? Call me on <PHONE>");
        assertThat(chat.get(0).get("answer")).isEqualTo("You sent <PERSON> ₹2,500 via <UPI_ID>.");
        assertThat(chat.get(0)).containsEntry("rating", -1).containsEntry("reason", "WRONG_NUMBERS");
        assertThat(anom.get(0)).containsEntry("verdict", "CONFIRMED").containsEntry("merchant", "Paid to <PERSON>");

        Map counts = restTemplate.exchange(baseUrl() + "/api/v1/admin/training-export", HttpMethod.GET, body(admin, null), Map.class).getBody();
        assertThat(((Number) counts.get("copilot")).intValue()).isEqualTo(allChat.size());
    }

    private static List<Map> mine(List<Map> rows, String user) {
        return rows.stream().filter(m -> user.equals(m.get("user"))).toList();
    }

    @Test
    void onlyAdminsCanExport() {
        String token = seedUserAndGetToken("export-plain@example.com", "Test@1234");
        assertThat(restTemplate.exchange(baseUrl() + "/api/v1/admin/training-export/categories", HttpMethod.GET,
                body(token, null), String.class).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        String admin = seedAdminAndGetToken("export-admin2@example.com", "Test@1234");
        assertThat(restTemplate.exchange(baseUrl() + "/api/v1/admin/training-export/passwords", HttpMethod.GET,
                body(admin, null), String.class).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }
}
