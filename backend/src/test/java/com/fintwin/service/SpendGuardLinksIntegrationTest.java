package com.fintwin.service;

import com.fintwin.AbstractIntegrationTest;
import com.fintwin.model.FinancialGoal;
import com.fintwin.model.GoalEarmark;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.FinancialGoalRepository;
import com.fintwin.repository.GoalEarmarkRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.security.AiToolToken;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/** Spend Guard connected to the rest of FinTwin, against a real database. */
@SuppressWarnings({"unchecked", "rawtypes"})
class SpendGuardLinksIntegrationTest extends AbstractIntegrationTest {

    @Autowired private SpendGuardLinks links;
    @Autowired private AiToolToken toolTokens;
    @Autowired private TransactionRepository transactions;
    @Autowired private FinancialGoalRepository goals;
    @Autowired private GoalEarmarkRepository earmarks;
    @Autowired private GoalPlannerService goalPlanner;
    @Autowired private JdbcTemplate jdbc;

    private static final LocalDate TODAY = LocalDate.now(SpendGuardLinks.INDIA);

    @AfterEach
    void clearLogin() {
        SecurityContextHolder.clearContext();
    }

    /** A user, signed in for service calls (cache eviction keys on the login). */
    private User user(String email) {
        seedUserAndGetToken(email, "Test@1234");
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(email, null, List.of()));
        return userRepository.findByEmail(email).orElseThrow();
    }

    private HttpEntity<Object> json(String token, Object body) {
        HttpHeaders h = authHeaders(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, h);
    }

    private HttpEntity<Object> internal(Long userId, Object body) {
        HttpHeaders h = new HttpHeaders();
        h.set("X-Internal-Key", "test-internal-key");
        h.set("X-Tool-Token", toolTokens.mint(userId));
        h.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, h);
    }

    @Test
    void aPaidPaymentBecomesATransaction_andTheStatementTakesItOver() {
        String email = "guard-links-pay@example.com";
        User user = user(email);
        Map<String, Object> record = Map.of("eventId", "a1b2c3", "merchant", "Chai Point", "amount", "450.00",
                "category", "Food", "categorySource", "MERCHANT_CODE");

        Long id = links.recordPayment(user.getId(), record);
        assertThat(id).isNotNull();
        assertThat(links.recordPayment(user.getId(), record)).isEqualTo(id);      // once per event

        Transaction t = transactions.findByUserAndExternalId(user, "GUARD:a1b2c3").orElseThrow();
        assertThat(t.getSource()).isEqualTo("SPEND_GUARD");
        assertThat(t.getAmount()).isEqualTo(-450.0);
        assertThat(t.getCategory()).isEqualTo("Food");
        assertThat(t.getDate()).isEqualTo(TODAY);

        // "I didn't pay" takes it back; a second event shows the statement rule below
        Long cancelled = links.recordPayment(user.getId(), Map.of("eventId", "dd01", "merchant", "Cancelled",
                "amount", "99", "category", "Food"));
        assertThat(links.unrecordPayment(user.getId(), "dd01")).isTrue();
        assertThat(transactions.findById(cancelled)).isEmpty();
        assertThat(links.unrecordPayment(user.getId(), "dd01")).isFalse();

        // The bank statement arrives with the same money: no second transaction
        String token = jwtUtil.generateToken(email, "USER");
        ResponseEntity<Map> imported = restTemplate.exchange(
                baseUrl() + "/api/v1/transactions/batch?accountType=BANK", HttpMethod.POST,
                json(token, List.of(Map.of("date", TODAY.toString(), "merchant", "UPI/CHAIPOINT/412233", "amount", -450))),
                Map.class);
        assertThat(imported.getBody()).containsEntry("imported", 0).containsEntry("reconciled", 1);
        List<Transaction> all = transactions.findByUser(user);
        assertThat(all).hasSize(1);
        assertThat(all.get(0).getSource()).isEqualTo("STATEMENT");
        assertThat(all.get(0).getCategory()).isEqualTo("Food");
        // Once the statement owns it, "I didn't pay" can't remove it
        assertThat(links.unrecordPayment(user.getId(), "a1b2c3")).isFalse();
        assertThat(transactions.findByUser(user)).hasSize(1);
    }

    @Test
    void aPaymentRecordIsCheckedField_byField() {
        User user = user("guard-links-bad@example.com");
        Long uid = user.getId();
        assertThat(links.recordPayment(uid, Map.of("eventId", "e1", "amount", "0"))).isNull();
        assertThat(links.recordPayment(uid, Map.of("eventId", "e2", "amount", "-5"))).isNull();
        assertThat(links.recordPayment(uid, Map.of("eventId", "e3", "amount", "abc"))).isNull();
        assertThat(links.recordPayment(uid, Map.of("eventId", "e4", "amount", "600000"))).isNull();
        assertThat(links.recordPayment(uid, Map.of("eventId", "../x", "amount", "100"))).isNull();
        assertThat(transactions.findByUser(user)).isEmpty();

        // An unknown category is worked out again, never stored as sent
        Long id = links.recordPayment(uid, Map.of("eventId", "e5", "merchant", "Swiggy", "amount", "300",
                "category", "Gambling", "categorySource", "MADE_UP"));
        Transaction t = transactions.findById(id).orElseThrow();
        assertThat(t.getCategory()).isNotEqualTo("Gambling");
        assertThat(t.getCategorySource()).isNotEqualTo("MADE_UP");
    }

    @Test
    void anApprovedPlanEarmarksGoalMoney_andGoalProgressUsesIt() {
        String email = "guard-links-goals@example.com";
        User user = user(email);
        FinancialGoal travel = goals.save(goal(user, "Travel"));
        FinancialGoal bike = goals.save(goal(user, "Bike"));

        // ₹10,000 actually saved this month
        String token = jwtUtil.generateToken(email, "USER");
        restTemplate.exchange(baseUrl() + "/api/v1/transactions/batch?accountType=BANK", HttpMethod.POST,
                json(token, List.of(
                        Map.of("date", TODAY.withDayOfMonth(1).toString(), "merchant", "SALARY ACME", "amount", 20000),
                        Map.of("date", TODAY.withDayOfMonth(1).toString(), "merchant", "RENT", "amount", -10000))),
                Map.class);

        String month = YearMonth.now(SpendGuardLinks.INDIA).toString();
        int n = links.earmarkGoals(user.getId(), Map.of("month", month, "goals", List.of(
                Map.of("goal", "travel", "amount", 8000), Map.of("goal", "No such goal", "amount", 500))));
        assertThat(n).isEqualTo(1);
        // Approving again for the month replaces the amount
        assertThat(links.earmarkGoals(user.getId(), Map.of("month", month,
                "goals", List.of(Map.of("goal", "Travel", "amount", 6000))))).isEqualTo(1);
        List<GoalEarmark> rows = earmarks.findByUser(user);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getAmount().intValue()).isEqualTo(6000);

        Map<String, Double> saved = new java.util.HashMap<>();
        for (FinancialGoal g : goalPlanner.getGoalsForUser(user)) saved.put(g.getTitle(), g.getExpectedSaved());
        assertThat(saved.get("Travel")).isCloseTo(8000.0, within(1.0));    // 6,000 first, then half of 4,000
        assertThat(saved.get("Bike")).isCloseTo(2000.0, within(1.0));

        // A month far away, or a bad one, earmarks nothing
        assertThat(links.earmarkGoals(user.getId(), Map.of("month", "2020-01",
                "goals", List.of(Map.of("goal", "Travel", "amount", 100))))).isZero();
        assertThat(links.earmarkGoals(user.getId(), Map.of("month", "soon",
                "goals", List.of(Map.of("goal", "Travel", "amount", 100))))).isZero();
        assertThat(travel.getId()).isNotEqualTo(bike.getId());
    }

    @Test
    void spendGuardsRecordsAreKeptEncrypted_andTheCopilotReadsTheSummary() {
        User user = user("guard-links-state@example.com");
        Long uid = user.getId();
        String url = baseUrl() + "/internal/ai/" + uid;
        String state = "{\"wallet\":{\"buffer\":3500,\"own_upi_id\":\"me@okbank\"},\"events\":{}}";
        String summary = "{\"month\":\"2026-11\",\"savedByPausingThisMonth\":1200,\"pausesThisMonth\":3}";

        ResponseEntity<Map> put = restTemplate.exchange(url + "/guard-state", HttpMethod.PUT,
                internal(uid, Map.of("state", state, "summary", summary)), Map.class);
        assertThat(put.getStatusCode()).isEqualTo(HttpStatus.OK);
        ResponseEntity<Map> got = restTemplate.exchange(url + "/guard-state", HttpMethod.GET, internal(uid, null), Map.class);
        assertThat(got.getBody()).containsEntry("state", state);

        String stored = jdbc.queryForObject("SELECT state FROM spend_guard_state WHERE user_id = ?", String.class, uid);
        assertThat(stored).doesNotContain("okbank").doesNotContain("buffer");

        Map<String, Object> copilot = restTemplate.exchange(url + "/spend-guard", HttpMethod.GET, internal(uid, null), Map.class).getBody();
        assertThat(copilot).containsEntry("active", true).containsEntry("savedByPausingThisMonth", 1200);

        // Not JSON: refused. Another user's token: refused.
        assertThat(restTemplate.exchange(url + "/guard-state", HttpMethod.PUT,
                internal(uid, Map.of("state", "not json")), Map.class).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(restTemplate.exchange(url + "/guard-state", HttpMethod.GET,
                internal(uid + 999, null), Map.class).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void theCopilotHearsWhenSpendGuardWasNeverUsed() {
        User user = user("guard-links-unused@example.com");
        Map<String, Object> copilot = restTemplate.exchange(baseUrl() + "/internal/ai/" + user.getId() + "/spend-guard",
                HttpMethod.GET, internal(user.getId(), null), Map.class).getBody();
        assertThat(copilot).containsEntry("active", false);
    }

    @Test
    void aScannedPayeeIsCategorisedLikeTheUsersTransactions() {
        User user = user("guard-links-cat@example.com");
        Map<String, Object> res = restTemplate.exchange(baseUrl() + "/internal/ai/" + user.getId() + "/categorize?name=Swiggy",
                HttpMethod.GET, internal(user.getId(), null), Map.class).getBody();
        assertThat(res).containsEntry("category", "Food");
    }

    private static FinancialGoal goal(User user, String title) {
        FinancialGoal g = new FinancialGoal();
        g.setUser(user);
        g.setTitle(title);
        g.setTargetAmount(50_000.0);
        g.setMonthlyTarget(5_000.0);
        g.setDurationMonths(10);
        g.setCreatedAt(TODAY);
        g.setCompleted(false);
        return g;
    }
}
