package com.fintwin.demo;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fintwin.AbstractIntegrationTest;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.net.InetSocketAddress;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * "Try the demo" end to end: one click in, everything readable, nothing
 * changeable, and each visitor's copilot chat their own.
 */
class DemoAccountIntegrationTest extends AbstractIntegrationTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final HttpServer AI;

    // A stand-in AI service: answers with how much earlier chat it was given,
    // which shows whose history the backend sent
    static {
        try {
            AI = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
            AI.createContext("/chat", ex -> {
                Map<?, ?> body = JSON.readValue(ex.getRequestBody(), Map.class);
                Map<?, ?> data = (Map<?, ?>) body.get("financialData");
                int history = ((List<?>) data.get("conversationHistory")).size();
                byte[] out = JSON.writeValueAsBytes(Map.of("success", true, "reply", "history=" + history,
                        "trace", Map.of("path", "test")));
                ex.getResponseHeaders().add("Content-Type", "application/json");
                ex.sendResponseHeaders(200, out.length);
                ex.getResponseBody().write(out);
                ex.close();
            });
            AI.start();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("ai.service.url", () -> "http://localhost:" + AI.getAddress().getPort());
        registry.add("demo.questions-per-session", () -> "2");
    }

    @AfterAll
    static void stopStub() {
        AI.stop(0);
    }

    @Autowired private DemoAccountService demo;
    @Autowired private JdbcTemplate jdbc;

    @BeforeEach
    void freshDemo() {
        demo.rebuild();
    }

    @SuppressWarnings("unchecked")
    private String startDemo() {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<Map> res = restTemplate.exchange(baseUrl() + "/api/v1/demo/start", HttpMethod.POST,
                new HttpEntity<>(Map.of("visitorId", "test-visitor-0001", "source", "LinkedIn.com"), h), Map.class);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).containsEntry("role", "DEMO");
        return (String) res.getBody().get("accessToken");
    }

    private ResponseEntity<String> call(String token, HttpMethod method, String path, Object body) {
        HttpHeaders h = authHeaders(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        return restTemplate.exchange(baseUrl() + path, method, new HttpEntity<>(body, h), String.class);
    }

    @SuppressWarnings("unchecked")
    private String ask(String token, String question) throws Exception {
        ResponseEntity<String> res = call(token, HttpMethod.POST, "/api/v1/transactions/chat",
                Map.of("message", question, "mode", "Savings Advisor"));
        return res.getStatusCode().value() + " " + JSON.readValue(res.getBody(), Map.class).get("reply");
    }

    @Test
    void oneClickGivesADemoAccountWithCurrentData() throws Exception {
        String token = startDemo();

        ResponseEntity<String> res = call(token, HttpMethod.GET, "/api/v1/transactions?months=3", null);
        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<Map<String, Object>> rows = JSON.readValue(res.getBody(), List.class);
        assertThat(rows).hasSizeGreaterThan(100);
        // Generated up to today, so the demo never shows an empty month
        String latest = rows.stream().map(r -> (String) r.get("date")).max(String::compareTo).orElseThrow();
        assertThat(LocalDate.parse(latest)).isAfterOrEqualTo(LocalDate.now(DemoAccountService.INDIA).minusDays(1));

        // The visit is recorded, with only the cleaned-up details
        Map<String, Object> session = jdbc.queryForMap(
                "SELECT visitor_id, device, source FROM demo_sessions ORDER BY started_at DESC LIMIT 1");
        assertThat(session).containsEntry("visitor_id", "test-visitor-0001")
                .containsEntry("source", "linkedin.com").containsEntry("device", "desktop");
    }

    @Test
    void nothingInTheDemoCanBeChanged() throws Exception {
        String token = startDemo();

        ResponseEntity<String> write = call(token, HttpMethod.POST, "/api/v1/budgets",
                Map.of("category", "Food", "limitAmount", 1));
        assertThat(write.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(JSON.readValue(write.getBody(), Map.class)).containsEntry("code", "demo_read_only");

        assertThat(call(token, HttpMethod.DELETE, "/api/v1/profile/delete", null).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(call(token, HttpMethod.PUT, "/api/v1/profile/update", Map.of("fullName", "x"))
                .getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);

        // What the app does by itself on opening a page is answered quietly
        ResponseEntity<String> seen = call(token, HttpMethod.POST, "/api/v1/daily-recap/seen", Map.of());
        assertThat(seen.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(seen.getBody()).contains("\"demo\":true");

        // What visitors tried to change is kept, to show what they wanted to do
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM demo_events WHERE kind = 'blocked' "
                + "AND detail = 'POST /api/v1/budgets'", Long.class)).isPositive();
    }

    @Test
    void eachVisitorHasTheirOwnChatAndQuestionAllowance() throws Exception {
        String first = startDemo();
        String second = startDemo();

        assertThat(ask(first, "Can I afford a car?")).isEqualTo("200 history=0");
        // A follow-up sees this visitor's earlier question...
        assertThat(ask(first, "10 lakhs")).isEqualTo("200 history=1");
        // ...and another visitor sees none of it
        assertThat(ask(second, "Where does my money go?")).isEqualTo("200 history=0");

        List<?> firstChat = JSON.readValue(
                call(first, HttpMethod.GET, "/api/v1/transactions/chat/history", null).getBody(), List.class);
        List<?> secondChat = JSON.readValue(
                call(second, HttpMethod.GET, "/api/v1/transactions/chat/history", null).getBody(), List.class);
        assertThat(firstChat).hasSize(4);       // two exchanges, question + answer each
        assertThat(secondChat).hasSize(2);

        // Two questions per visit in this test (demo.questions-per-session)
        assertThat(ask(first, "One more?")).startsWith("429 That's the 2 questions this demo allows");

        // Clearing one's chat leaves everyone else's
        call(first, HttpMethod.DELETE, "/api/v1/transactions/chat/history", null);
        assertThat(JSON.readValue(call(second, HttpMethod.GET, "/api/v1/transactions/chat/history", null)
                .getBody(), List.class)).hasSize(2);

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM demo_events WHERE kind = 'question'", Long.class))
                .isGreaterThanOrEqualTo(3);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> goals(String token) throws Exception {
        return JSON.readValue(call(token, HttpMethod.GET, "/api/v1/goals", null).getBody(), List.class);
    }

    @Test
    @SuppressWarnings("unchecked")
    void eachVisitorBuildsAndRegeneratesGoalsOfTheirOwn() throws Exception {
        String a = startDemo();
        String b = startDemo();
        List<Map<String, Object>> samples = goals(a);
        assertThat(samples).hasSize(3);
        Object sampleId = samples.get(0).get("id");

        // A builds a goal: theirs alone
        ResponseEntity<String> made = call(a, HttpMethod.POST, "/api/v1/goals",
                Map.of("title", "New Laptop", "targetAmount", 80000, "durationMonths", 8));
        assertThat(made.getStatusCode()).isEqualTo(HttpStatus.OK);
        Object ownId = JSON.readValue(made.getBody(), Map.class).get("id");
        assertThat(goals(a)).hasSize(4);
        assertThat(goals(b)).hasSize(3);

        // A regenerates a sample goal: their copy takes its place, for them only
        ResponseEntity<String> regen = call(a, HttpMethod.POST, "/api/v1/goals/" + sampleId + "/regenerate", Map.of());
        assertThat(regen.getStatusCode()).isEqualTo(HttpStatus.OK);
        Object copyId = JSON.readValue(regen.getBody(), Map.class).get("id");
        assertThat(copyId).isNotEqualTo(sampleId);
        assertThat(goals(a)).hasSize(4).extracting(g -> g.get("id")).contains(copyId).doesNotContain(sampleId);
        assertThat(goals(b)).extracting(g -> g.get("id")).contains(sampleId).doesNotContain(copyId, ownId);

        // The shared samples can't be edited; one's own goals can be deleted; another's can't
        ResponseEntity<String> edit = call(a, HttpMethod.PUT, "/api/v1/goals/" + samples.get(1).get("id"),
                Map.of("title", "Changed", "targetAmount", 1000, "durationMonths", 2));
        assertThat(edit.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(JSON.readValue(edit.getBody(), Map.class)).containsEntry("code", "demo_read_only");
        assertThat(call(b, HttpMethod.DELETE, "/api/v1/goals/" + ownId, null).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(call(a, HttpMethod.DELETE, "/api/v1/goals/" + ownId, null).getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(goals(a)).hasSize(3);

        // Five goals a visit
        for (int i = 0; i < 5; i++) {
            call(a, HttpMethod.POST, "/api/v1/goals", Map.of("title", "Goal " + i, "targetAmount", 10000, "durationMonths", 6));
        }
        ResponseEntity<String> sixth = call(a, HttpMethod.POST, "/api/v1/goals",
                Map.of("title", "One too many", "targetAmount", 10000, "durationMonths", 6));
        assertThat(sixth.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(goals(b)).hasSize(3);
    }

    @Test
    void theDemoIsNotCountedAsAUser() {
        demo.demoUser();
        long all = userRepository.count();
        assertThat(userRepository.countRealUsers()).isEqualTo(all - 1);
    }

    @Test
    void theDemoCannotBeEnteredWithoutItsOwnEndpoint() {
        // An ordinary token for the demo email still gets the read-only DEMO
        // role from the database, whatever the token says
        String token = jwtUtil.generateToken(DemoAccountService.EMAIL, "ADMIN");
        assertThat(call(token, HttpMethod.POST, "/api/v1/budgets", Map.of("category", "Food", "limitAmount", 1))
                .getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(call(token, HttpMethod.GET, "/api/v1/admin/users", null).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }
}
