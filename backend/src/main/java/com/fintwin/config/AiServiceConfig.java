package com.fintwin.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

@Configuration
public class AiServiceConfig {

    @Value("${ai.service.internal-key}")
    private String internalKey;

    // Named bean used by every service that calls the AI service.
    // Automatically injects X-Internal-Key on every outbound request.
    @Bean("aiRestTemplate")
    public RestTemplate aiRestTemplate() {
        RestTemplate rt = new RestTemplate();
        rt.getInterceptors().add((request, body, execution) -> {
            request.getHeaders().set("X-Internal-Key", internalKey);
            return execution.execute(request, body);
        });
        return rt;
    }
}
