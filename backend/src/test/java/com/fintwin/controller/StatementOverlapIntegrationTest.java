package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import com.fintwin.model.User;
import com.fintwin.repository.TransactionRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Two statements of one account whose dates overlap, from different apps or
 * formats: the second one's rows describe the same payments in other words.
 */
@SuppressWarnings({"unchecked", "rawtypes"})
class StatementOverlapIntegrationTest extends AbstractIntegrationTest {

    @Autowired private TransactionRepository transactions;

    private Map<String, Object> importRows(String token, String query, List<Map<String, Object>> rows) {
        HttpHeaders h = authHeaders(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<Map> r = restTemplate.exchange(baseUrl() + "/api/v1/transactions/batch" + query,
                HttpMethod.POST, new HttpEntity<>(rows, h), Map.class);
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.OK);
        return r.getBody();
    }

    private static Map<String, Object> row(String date, String merchant, double amount) {
        return Map.of("date", date, "merchant", merchant, "amount", amount);
    }

    private User user(String email) {
        return userRepository.findByEmail(email).orElseThrow();
    }

    @Test
    void aBankStatementOverAUpiAppStatement_addsOnlyThePaymentsThatAreNew() {
        String email = "overlap-formats@example.com";
        String token = seedUserAndGetToken(email, "Test@1234");

        // A UPI app's statement, oldest first
        Map<String, Object> first = importRows(token, "?accountType=BANK", List.of(
                row("2026-09-01", "Paid to KRUSHNA PROVISIONS", -105),
                row("2026-09-01", "Paid to Chai Point", -20),
                row("2026-09-01", "Paid to Chai Point", -20),
                row("2026-09-02", "Received from foujiya", 100),
                row("2026-09-03", "Paid to Late Night Dhaba", -300)));
        assertThat(first).containsEntry("imported", 5);

        // The bank's statement of the same account, newest first, other wording
        List<Map<String, Object>> bank = List.of(
                row("2026-09-04", "UPI/DR/9/LATE NIGHT DHABA", -300),  // posted the next day: same payment
                row("2026-09-04", "UPI/DR/2/NEW SHOP", -450),          // new
                row("2026-09-02", "NEFT/CR/FOUJIYA", 100),
                row("2026-09-01", "UPI/DR/3/KRUSHNA PROV", -105),
                row("2026-09-01", "UPI/DR/4/CHAI POINT", -20),
                row("2026-09-01", "UPI/DR/5/CHAI POINT", -20),
                row("2026-09-01", "UPI/DR/6/CHAI POINT", -20),         // a third chai: new
                row("2026-08-31", "UPI/DR/7/OLD SHOP", -105));         // before the first file: new
        Map<String, Object> second = importRows(token, "?accountType=BANK", bank);
        assertThat(second).containsEntry("imported", 3).containsEntry("duplicates", 5);
        assertThat(transactions.findByUser(user(email))).hasSize(8);

        // The same bank file again changes nothing
        assertThat(importRows(token, "?accountType=BANK", bank))
                .containsEntry("imported", 0).containsEntry("duplicates", 8);
        assertThat(transactions.findByUser(user(email))).hasSize(8);
    }

    @Test
    void aPaymentOnTheFilesFirstDayIsNeverTakenForOneTheDayBefore() {
        String email = "overlap-edge@example.com";
        String token = seedUserAndGetToken(email, "Test@1234");
        importRows(token, "", List.of(row("2026-08-31", "Paid to Ravi", -50)));

        Map<String, Object> later = importRows(token, "", List.of(row("2026-09-01", "UPI/DR/1/RAVI", -50)));
        assertThat(later).containsEntry("imported", 1);
    }

    @Test
    void anotherNamedAccountIsNeverMatched() {
        String email = "overlap-accounts@example.com";
        String token = seedUserAndGetToken(email, "Test@1234");
        importRows(token, "?account=HDFC", List.of(row("2026-09-05", "Paid to Swiggy", -350)));

        assertThat(importRows(token, "?account=ICICI", List.of(row("2026-09-05", "UPI/DR/1/SWIGGY", -350))))
                .containsEntry("imported", 1);
        assertThat(importRows(token, "?account=HDFC", List.of(row("2026-09-05", "UPI/DR/1/SWIGGY", -350))))
                .containsEntry("imported", 0).containsEntry("duplicates", 1);
    }
}
