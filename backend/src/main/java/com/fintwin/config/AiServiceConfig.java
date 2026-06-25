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
     * Hard timeouts prevent a hung Ollama from exhausting the HikariCP thread pool.
     *   connect: 5 s  — fail fast if the AI service pod is unreachable
     *   read:    60 s — phi3:mini can take up to 45 s on complex forecasts
     */
    @Bean("aiRestTemplate")
    public RestTemplate aiRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(60_000);

        RestTemplate rt = new RestTemplate(factory);
        rt.getInterceptors().add((request, body, execution) -> {
            request.getHeaders().set("X-Internal-Key", internalKey);
            return execution.execute(request, body);
        });
        return rt;
    }
}
