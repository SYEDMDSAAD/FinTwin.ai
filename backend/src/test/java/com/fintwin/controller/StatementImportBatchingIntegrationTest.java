package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import com.fintwin.repository.TransactionRepository;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A statement import must not cost one database round trip per row. Against
 * a remote database (~160 ms away) a 341-row PhonePe statement took about a
 * minute when every INSERT ran alone; batched, it's a handful of trips.
 */
class StatementImportBatchingIntegrationTest extends AbstractIntegrationTest {

    @Autowired private EntityManagerFactory emf;
    @Autowired private TransactionRepository transactions;

    @Test
    void importingManyRowsUsesBatchedInsertsNotOneStatementPerRow() {
        String token = seedUserAndGetToken("batch-import@example.com", "Test@1234");
        HttpHeaders h = authHeaders(token);
        h.setContentType(MediaType.APPLICATION_JSON);

        int n = 200;
        List<Map<String, Object>> rows = new ArrayList<>();
        LocalDate start = LocalDate.of(2026, 6, 1);
        for (int i = 0; i < n; i++) {
            rows.add(Map.of("date", start.plusDays(i % 90).toString(),
                    "merchant", "UPI/MERCHANT " + i, "amount", -(100.0 + i)));
        }

        Statistics stats = emf.unwrap(SessionFactory.class).getStatistics();
        stats.clear();

        ResponseEntity<Map> resp = restTemplate.exchange(
                baseUrl() + "/api/v1/transactions/batch?accountType=BANK&account=HDFC ··1234",
                HttpMethod.POST, new HttpEntity<>(rows, h), Map.class);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody().get("imported")).isEqualTo(n);

        long statements = stats.getPrepareStatementCount();
        // One statement per row would be 200+; batched it's a few dozen at most
        // (lookups, 4 insert batches, sequence fetches, score snapshot, audit)
        assertThat(statements).as("SQL statements for a %d-row import", n).isLessThan(60);

        var user = userRepository.findByEmail("batch-import@example.com").orElseThrow();
        assertThat(transactions.findByUser(user)).hasSize(n);
    }
}
