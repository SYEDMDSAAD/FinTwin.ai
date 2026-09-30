package com.fintwin.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.Clock;
import java.time.Instant;

/**
 * Whether the AI service is answering, so the app can say so before a user
 * asks the copilot something, rather than after.
 *
 * The AI can be offline for hours at a time — it may run on a machine that is
 * switched off, behind a tunnel — so this is a real state to show, not a rare
 * error. One ping to its /health serves every user for {@link #TTL_SECONDS}.
 */
@Service
public class AiStatusService {

    private static final Logger log = LoggerFactory.getLogger(AiStatusService.class);
    static final long TTL_SECONDS = 30;

    public record Status(boolean available, Instant checkedAt) {}

    private final RestTemplate http;
    private final String aiServiceUrl;
    private final Clock clock;
    private volatile Status last;

    @Autowired
    public AiStatusService(@Value("${ai.service.url}") String aiServiceUrl) {
        this(aiServiceUrl, quickClient(), Clock.systemUTC());
    }

    AiStatusService(String aiServiceUrl, RestTemplate http, Clock clock) {
        this.aiServiceUrl = aiServiceUrl;
        this.http = http;
        this.clock = clock;
    }

    // Short timeouts: a status check that hangs is worse than one that says "offline"
    private static RestTemplate quickClient() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2_000);
        factory.setReadTimeout(3_000);
        return new RestTemplate(factory);
    }

    public Status current() {
        Status s = last;
        if (s != null && s.checkedAt().plusSeconds(TTL_SECONDS).isAfter(clock.instant())) return s;
        synchronized (this) {
            s = last;
            if (s != null && s.checkedAt().plusSeconds(TTL_SECONDS).isAfter(clock.instant())) return s;
            last = s = new Status(ping(), clock.instant());
            return s;
        }
    }

    private boolean ping() {
        try {
            http.getForObject(aiServiceUrl + "/health", String.class);
            return true;
        } catch (RestClientException e) {
            log.info("AI service is offline: {}", e.getClass().getSimpleName());
            return false;
        }
    }
}
