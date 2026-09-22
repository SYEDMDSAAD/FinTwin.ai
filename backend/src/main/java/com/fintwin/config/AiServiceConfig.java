package com.fintwin.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

@Configuration
public class AiServiceConfig {

    @Value("${ai.service.internal-key}")
    private String internalKey;

    /**
     * RestTemplate for all AI service calls.
     *   connect: 3 s  — fail fast if the AI service is unreachable
     *   read:    20 s — phi3:mini on CPU typically responds in 5-15 s; 20 s is safe headroom
     * The circuit breaker handles repeated failures; keep timeout tight to release threads quickly.
     */
    @Bean("aiRestTemplate")
    public RestTemplate aiRestTemplate() {
        return build(20_000);
    }

    /**
     * The copilot alone gets a longer read budget. A tool-using answer is
     * several model calls in a row (up to three data lookups, then the reply);
     * on a CPU with qwen2.5:3b real questions took 17–24 s at the AI service
     * alone, so the shared 20 s budget failed ordinary chats with "Read timed
     * out". The AI service caps its own work below this (CHAT_BUDGET_SECONDS),
     * so it answers — or says it ran out of time — before we give up.
     */
    @Bean("aiChatRestTemplate")
    public RestTemplate aiChatRestTemplate(
            @Value("${ai.service.chat-read-timeout-ms:90000}") int readTimeoutMs) {
        return build(readTimeoutMs);
    }

    /**
     * Reading a statement PDF gets its own budget too: a 2-year UPI app
     * statement is ~300 pages, and table-ruled pages take ~0.1 s each to read.
     * Kept under the 100 s that nginx and Cloudflare give a proxied request.
     */
    @Bean("aiStatementRestTemplate")
    public RestTemplate aiStatementRestTemplate(
            @Value("${ai.service.statement-read-timeout-ms:90000}") int readTimeoutMs) {
        return build(readTimeoutMs);
    }

        private RestTemplate build(int readTimeoutMs) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3_000);
        factory.setReadTimeout(readTimeoutMs);

        RestTemplate rt = new RestTemplate(factory);
        rt.getInterceptors().add((request, body, execution) -> {
            request.getHeaders().set("X-Internal-Key", internalKey);
            return execution.execute(request, body);
        });
        return rt;
    }
}
