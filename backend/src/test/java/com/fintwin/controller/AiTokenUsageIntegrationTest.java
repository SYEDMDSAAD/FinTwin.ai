package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import com.fintwin.service.AiTokenUsageService;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestTemplate;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Token counts from the AI service's X-LLM-Usage header reach the right user's totals and the admin view. */
class AiTokenUsageIntegrationTest extends AbstractIntegrationTest {

    @Autowired private AiTokenUsageService usage;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager txManager;
    @Autowired @Qualifier("aiRestTemplate") private RestTemplate aiRestTemplate;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    private void actAs(String email) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(email, null, List.of()));
    }

    private Map<String, Object> row(String email, String feature) {
        Long id = userRepository.findByEmail(email).orElseThrow().getId();
        return jdbc.queryForMap("SELECT input_tokens, output_tokens, calls FROM ai_token_usage "
                + "WHERE user_id = ? AND feature = ? AND usage_date = CURRENT_DATE", id, feature);
    }

    @Test
    void usageIsAddedToTheLoggedInUsersDailyRowPerFeature() {
        String email = "tokens-adder@example.com";
        seedUserAndGetToken(email, "Test@1234");
        actAs(email);

        usage.record("{\"coach\":{\"in\":800,\"out\":100,\"calls\":1},\"copilot\":{\"in\":50,\"out\":5,\"calls\":2}}");
        usage.record("{\"coach\":{\"in\":200,\"out\":40,\"calls\":1}}");

        assertThat(row(email, "coach")).containsEntry("input_tokens", 1000L)
                .containsEntry("output_tokens", 140L).containsEntry("calls", 2);
        assertThat(row(email, "copilot")).containsEntry("input_tokens", 50L).containsEntry("calls", 2);
    }

    @Test
    void recordingInsideAReadOnlyTransactionStillWrites() {
        String email = "tokens-readonly@example.com";
        seedUserAndGetToken(email, "Test@1234");
        actAs(email);

        TransactionTemplate readOnly = new TransactionTemplate(txManager);
        readOnly.setReadOnly(true);
        readOnly.executeWithoutResult(s -> usage.record("{\"report\":{\"in\":10,\"out\":2,\"calls\":1}}"));

        assertThat(row(email, "report")).containsEntry("input_tokens", 10L);
    }

    @Test
    void badHeadersAndMissingUsersAreIgnoredWithoutThrowing() {
        usage.record("{\"coach\":{\"in\":1,\"out\":1,\"calls\":1}}");   // no user logged in
        actAs("tokens-nobody@example.com");                               // not a user
        usage.record("{\"coach\":{\"in\":1,\"out\":1,\"calls\":1}}");
        usage.record("not json");
        usage.record("{\"DROP TABLE\":{\"in\":1}}");                      // not a feature name

        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM ai_token_usage WHERE feature NOT SIMILAR TO '[a-z_]+'", Long.class))
                .isZero();
    }

    @Test
    void theAiRestTemplateRecordsTheHeaderOfARealResponse() throws Exception {
        String email = "tokens-http@example.com";
        seedUserAndGetToken(email, "Test@1234");
        actAs(email);

        HttpServer stub = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        stub.createContext("/goal-plan", ex -> {
            byte[] body = "{\"plan\":[]}".getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.getResponseHeaders().add(AiTokenUsageService.USAGE_HEADER,
                    "{\"goal_plan\":{\"in\":321,\"out\":45,\"calls\":2}}");
            ex.sendResponseHeaders(200, body.length);
            ex.getResponseBody().write(body);
            ex.close();
        });
        stub.start();
        try {
            aiRestTemplate.postForObject("http://localhost:" + stub.getAddress().getPort() + "/goal-plan",
                    Map.of(), Map.class);
        } finally {
            stub.stop(0);
        }

        assertThat(row(email, "goal_plan")).containsEntry("input_tokens", 321L)
                .containsEntry("output_tokens", 45L).containsEntry("calls", 2);
    }

    @Test
    @SuppressWarnings("unchecked")
    void adminSeesTotalsPerFeatureAndPerUserWithTheirSplit() {
        String heavy = "tokens-heavy@example.com", light = "tokens-light@example.com";
        seedUserAndGetToken(heavy, "Test@1234");
        seedUserAndGetToken(light, "Test@1234");
        actAs(heavy);
        usage.record("{\"copilot\":{\"in\":90000,\"out\":9000,\"calls\":30},\"coach\":{\"in\":5000,\"out\":500,\"calls\":2}}");
        actAs(light);
        usage.record("{\"coach\":{\"in\":1000,\"out\":100,\"calls\":1}}");
        SecurityContextHolder.clearContext();

        String admin = seedAdminAndGetToken("tokens-admin@example.com", "Test@1234");
        ResponseEntity<Map> r = restTemplate.exchange(baseUrl() + "/api/v1/admin/ai-usage?days=7",
                HttpMethod.GET, new HttpEntity<>(authHeaders(admin)), Map.class);
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.OK);

        Map<String, Object> body = r.getBody();
        List<Map<String, Object>> users = (List<Map<String, Object>>) body.get("users");
        Map<String, Object> heavyRow = users.stream().filter(u -> heavy.equals(u.get("email"))).findFirst().orElseThrow();
        Map<String, Object> lightRow = users.stream().filter(u -> light.equals(u.get("email"))).findFirst().orElseThrow();

        assertThat(users.indexOf(heavyRow)).isLessThan(users.indexOf(lightRow));   // heaviest first
        assertThat(((Number) heavyRow.get("totalTokens")).longValue()).isEqualTo(104_500L);
        assertThat(((Number) heavyRow.get("calls")).longValue()).isEqualTo(32L);
        Map<String, Map<String, Object>> split = (Map<String, Map<String, Object>>) heavyRow.get("byFeature");
        assertThat(((Number) split.get("copilot").get("totalTokens")).longValue()).isEqualTo(99_000L);
        assertThat(((Number) split.get("coach").get("inputTokens")).longValue()).isEqualTo(5_000L);

        List<Map<String, Object>> features = (List<Map<String, Object>>) body.get("byFeature");
        assertThat(features).extracting(f -> f.get("feature")).contains("copilot", "coach");
        assertThat((List<?>) body.get("daily")).isNotEmpty();
    }

    @Test
    void regularUsersCannotSeeIt() {
        String token = seedUserAndGetToken("tokens-snoop@example.com", "Test@1234");
        ResponseEntity<String> r = restTemplate.exchange(baseUrl() + "/api/v1/admin/ai-usage",
                HttpMethod.GET, new HttpEntity<>(authHeaders(token)), String.class);
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }
}
