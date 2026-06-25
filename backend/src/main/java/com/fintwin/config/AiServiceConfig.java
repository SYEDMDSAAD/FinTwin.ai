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
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3_000);
        factory.setReadTimeout(20_000);

        RestTemplate rt = new RestTemplate(factory);
        rt.getInterceptors().add((request, body, execution) -> {
            request.getHeaders().set("X-Internal-Key", internalKey);
            return execution.execute(request, body);
        });
        return rt;
    }
}
