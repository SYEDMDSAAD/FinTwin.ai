package com.fintwin.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fintwin.AbstractIntegrationTest;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The whole tool-token loop over real HTTP: the backend mints a token into the
 * /chat request, a stand-in AI service calls back into /internal/ai with it
 * (as chatbot/tools.py does), and the backend lets exactly that call through.
 */
class CopilotToolTokenRoundTripIntegrationTest extends AbstractIntegrationTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final AtomicInteger backendPort = new AtomicInteger();
    private static final HttpServer AI;

    static {
        try {
            AI = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
            AI.createContext("/chat", ex -> {
                Map<?, ?> body = JSON.readValue(ex.getRequestBody(), Map.class);
                Map<?, ?> data = (Map<?, ?>) body.get("financialData");
                String url = "http://localhost:" + backendPort.get() + "/internal/ai/" + data.get("userId") + "/budgets";
                int withToken = callBack(url, (String) data.get("toolToken"));
                int withoutToken = callBack(url, null);
                byte[] out = JSON.writeValueAsBytes(Map.of(
                        "success", true, "reply", "withToken=" + withToken + " withoutToken=" + withoutToken,
                        "trace", Map.of("path", "tools")));
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

    private static int callBack(String url, String token) {
        try {
            HttpRequest.Builder req = HttpRequest.newBuilder(URI.create(url)).header("X-Internal-Key", "test-internal-key");
            if (token != null) req.header("X-Tool-Token", token);
            return HttpClient.newHttpClient().send(req.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
                    .statusCode();
        } catch (Exception e) {
            return -1;
        }
    }

    @DynamicPropertySource
    static void aiServiceUrl(DynamicPropertyRegistry registry) {
        registry.add("ai.service.url", () -> "http://localhost:" + AI.getAddress().getPort());
    }

    @AfterAll
    static void stopStub() {
        AI.stop(0);
    }

    @Test
    void theTokenMintedForAChatUnlocksThatUsersDataAndNothingElseDoes() {
        backendPort.set(port);
        String token = seedUserAndGetToken("roundtrip@example.com", "Test@1234");
        HttpHeaders h = authHeaders(token);
        h.setContentType(MediaType.APPLICATION_JSON);

        ResponseEntity<Map> r = restTemplate.exchange(baseUrl() + "/api/v1/transactions/chat", HttpMethod.POST,
                new HttpEntity<>(Map.of("message", "am I within budget?", "mode", "Budget Coach"), h), Map.class);

        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(r.getBody().get("reply")).isEqualTo("withToken=200 withoutToken=403");
    }
}
