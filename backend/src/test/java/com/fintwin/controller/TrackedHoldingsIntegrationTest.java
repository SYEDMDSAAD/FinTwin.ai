package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import com.fintwin.model.FinancialGoal;
import com.fintwin.model.User;
import com.fintwin.repository.FinancialGoalRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** SIPs, US holdings and the fund watchlist live in the account, per user, encrypted. */
class TrackedHoldingsIntegrationTest extends AbstractIntegrationTest {

    @Autowired private FinancialGoalRepository goals;
    @Autowired private JdbcTemplate jdbc;

    private <T> ResponseEntity<T> call(String token, HttpMethod method, String path, Object body, Class<T> type) {
        HttpHeaders h = authHeaders(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        return restTemplate.exchange(baseUrl() + path, method, new HttpEntity<>(body, h), type);
    }

    private Long seedGoal(String email, String title) {
        User user = userRepository.findByEmail(email).orElseThrow();
        FinancialGoal g = new FinancialGoal();
        g.setUser(user);
        g.setTitle(title);
        g.setTargetAmount(100_000.0);
        g.setMonthlyTarget(5_000.0);
        g.setDurationMonths(20);
        g.setCreatedAt(LocalDate.now());
        g.setCompleted(false);
        return goals.save(g).getId();
    }

    @Test
    void sipsAreStoredPerUserAndEncrypted() {
        String alice = seedUserAndGetToken("th-alice@example.com", "Test@1234");
        String bob = seedUserAndGetToken("th-bob@example.com", "Test@1234");

        Map made = call(alice, HttpMethod.POST, "/api/v1/sips",
                Map.of("fundName", "Index Fund Direct", "amount", 5000, "frequency", "Quarterly",
                        "nextDebitDate", "2026-12-05"), Map.class).getBody();
        assertThat(made.get("fundName")).isEqualTo("Index Fund Direct");
        Long id = ((Number) made.get("id")).longValue();

        assertThat(call(alice, HttpMethod.GET, "/api/v1/sips", null, List.class).getBody()).hasSize(1);
        assertThat(call(bob, HttpMethod.GET, "/api/v1/sips", null, List.class).getBody()).isEmpty();

        // Bob can neither change nor delete Alice's SIP.
        assertThat(call(bob, HttpMethod.DELETE, "/api/v1/sips/" + id, null, String.class).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(call(bob, HttpMethod.PUT, "/api/v1/sips/" + id,
                Map.of("fundName", "x", "amount", 1), String.class).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

        String raw = jdbc.queryForObject("SELECT fund_name FROM sip_plan WHERE id = ?", String.class, id);
        assertThat(raw).doesNotContain("Index Fund");

        assertThat(call(alice, HttpMethod.DELETE, "/api/v1/sips/" + id, null, String.class).getStatusCode())
                .isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(call(alice, HttpMethod.GET, "/api/v1/sips", null, List.class).getBody()).isEmpty();
    }

    @Test
    void badSipsAreRejected() {
        String t = seedUserAndGetToken("th-bad@example.com", "Test@1234");
        for (Map<String, Object> body : List.of(
                Map.<String, Object>of("fundName", "", "amount", 100),
                Map.<String, Object>of("fundName", "Fund", "amount", -5),
                Map.<String, Object>of("fundName", "Fund", "amount", 100, "frequency", "Weekly")))
            assertThat(call(t, HttpMethod.POST, "/api/v1/sips", body, String.class).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void aGoalHasAtMostOneSipAndCannotBorrowAnotherUsersGoal() {
        String alice = seedUserAndGetToken("th-goal-a@example.com", "Test@1234");
        String bob = seedUserAndGetToken("th-goal-b@example.com", "Test@1234");
        Long goal = seedGoal("th-goal-a@example.com", "House");

        call(alice, HttpMethod.POST, "/api/v1/sips", Map.of("amount", 3000, "goalId", goal), Map.class);
        Map again = call(alice, HttpMethod.POST, "/api/v1/sips",
                Map.of("fundName", "Flexi Cap", "amount", 4000, "goalId", goal), Map.class).getBody();
        List<Map> mine = call(alice, HttpMethod.GET, "/api/v1/sips", null, List.class).getBody();
        assertThat(mine).hasSize(1);
        assertThat(again.get("fundName")).isEqualTo("Flexi Cap");
        assertThat(((Number) mine.get(0).get("goalId")).longValue()).isEqualTo(goal);

        assertThat(call(bob, HttpMethod.POST, "/api/v1/sips",
                Map.of("fundName", "x", "amount", 1, "goalId", goal), String.class).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);

        // Deleting the goal unlinks the SIP instead of deleting it.
        goals.deleteById(goal);
        List<Map> after = call(alice, HttpMethod.GET, "/api/v1/sips", null, List.class).getBody();
        assertThat(after).hasSize(1);
        assertThat(after.get(0).get("goalId")).isNull();
    }

    @Test
    void usHoldingsAndWatchlist() {
        String t = seedUserAndGetToken("th-us@example.com", "Test@1234");
        Map h = call(t, HttpMethod.POST, "/api/v1/us-holdings",
                Map.of("name", "Apple", "ticker", "aapl", "units", 2.5, "buyPrice", 180.25), Map.class).getBody();
        assertThat(h.get("ticker")).isEqualTo("AAPL");
        assertThat(call(t, HttpMethod.POST, "/api/v1/us-holdings",
                Map.of("name", "Bad", "ticker", "A A; drop", "units", 1, "buyPrice", 1), String.class).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        // mfapi sends scheme codes as numbers; watching twice keeps one row.
        call(t, HttpMethod.POST, "/api/v1/fund-watchlist", Map.of("schemeCode", 120503, "schemeName", "Some Fund"), Map.class);
        call(t, HttpMethod.POST, "/api/v1/fund-watchlist", Map.of("schemeCode", "120503", "schemeName", "Some Fund"), Map.class);
        assertThat(call(t, HttpMethod.GET, "/api/v1/fund-watchlist", null, List.class).getBody()).hasSize(1);
        call(t, HttpMethod.DELETE, "/api/v1/fund-watchlist/120503", null, String.class);
        assertThat(call(t, HttpMethod.GET, "/api/v1/fund-watchlist", null, List.class).getBody()).isEmpty();
    }

    @Test
    void deviceImportIsIdempotentSkipsJunkAndMergesGoalLinks() {
        String t = seedUserAndGetToken("th-import@example.com", "Test@1234");
        Long goal = seedGoal("th-import@example.com", "Car");
        Map<String, Object> body = Map.of(
                "sips", List.of(
                        Map.of("fundName", "Midcap", "amount", 2000, "frequency", "Monthly", "nextDebitDate", "2026-12-01"),
                        Map.of("fundName", "", "amount", 5)),
                "goalSipLinks", List.of(Map.of("goalId", goal, "fundName", "Midcap", "monthlyAmount", 2000),
                        Map.of("goalId", 999_999, "fundName", "x", "monthlyAmount", 1)),
                "usHoldings", List.of(Map.of("name", "Microsoft", "ticker", "MSFT", "units", 1, "buyPrice", 400)),
                "watchlist", List.of(Map.of("schemeCode", 100001, "schemeName", "A Fund")));

        ResponseEntity<Map> first = call(t, HttpMethod.POST, "/api/v1/device-data/import", body, Map.class);
        // A blank fund name and a goal that isn't theirs are skipped, not fatal.
        assertThat(first.getBody()).containsEntry("sips", 1).containsEntry("goalLinks", 1)
                .containsEntry("usHoldings", 1).containsEntry("watchlist", 1).containsEntry("skipped", 2);

        // The goal link described the tracked Midcap SIP, so it linked rather than duplicated.
        List<Map> sips = call(t, HttpMethod.GET, "/api/v1/sips", null, List.class).getBody();
        assertThat(sips).hasSize(1);
        assertThat(((Number) sips.get(0).get("goalId")).longValue()).isEqualTo(goal);

        Map second = call(t, HttpMethod.POST, "/api/v1/device-data/import", body, Map.class).getBody();
        assertThat(second).containsEntry("sips", 0).containsEntry("goalLinks", 0)
                .containsEntry("usHoldings", 0).containsEntry("watchlist", 0);
    }

    @Test
    void needsASignedInUser() {
        assertThat(restTemplate.getForEntity(baseUrl() + "/api/v1/sips", String.class).getStatusCode().is4xxClientError()).isTrue();
    }
}
