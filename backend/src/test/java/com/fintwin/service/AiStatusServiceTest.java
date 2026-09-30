package com.fintwin.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class AiStatusServiceTest {

    private RestTemplate ai;
    private final AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-09-30T12:00:00Z"));
    private AiStatusService service;

    @BeforeEach
    void setUp() {
        ai = mock(RestTemplate.class);
        Clock clock = new Clock() {
            @Override public ZoneOffset getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(java.time.ZoneId zone) { return this; }
            @Override public Instant instant() { return now.get(); }
        };
        service = new AiStatusService("http://ai", ai, clock);
    }

    @Test
    void onlineWhenHealthAnswers() {
        when(ai.getForObject("http://ai/health", String.class)).thenReturn("{\"status\":\"ok\"}");
        assertThat(service.current().available()).isTrue();
    }

    @Test
    void offlineWhenTheTunnelIsGone() {
        // What a stopped quick tunnel looks like: its hostname no longer resolves
        when(ai.getForObject("http://ai/health", String.class))
                .thenThrow(new ResourceAccessException("I/O error: fintwin.trycloudflare.com"));
        assertThat(service.current().available()).isFalse();
    }

    @Test
    void oneCheckServesEveryoneForThirtySeconds() {
        when(ai.getForObject("http://ai/health", String.class)).thenReturn("ok");
        service.current();
        now.set(now.get().plus(Duration.ofSeconds(29)));
        service.current();
        verify(ai, times(1)).getForObject("http://ai/health", String.class);

        // Then it looks again, so a laptop switched back on shows up within the minute
        now.set(now.get().plus(Duration.ofSeconds(2)));
        when(ai.getForObject("http://ai/health", String.class))
                .thenThrow(new ResourceAccessException("gone"));
        assertThat(service.current().available()).isFalse();
        verify(ai, times(2)).getForObject("http://ai/health", String.class);
    }
}
