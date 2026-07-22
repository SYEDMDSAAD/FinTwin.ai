package com.fintwin.config;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;

@Component
public class FinTwinMetrics {

    public final Counter loginSuccess;
    public final Counter loginFailure;
    public final Counter registrations;
    public final Counter transactionsCreated;
    public final Counter aiForecastCalls;
    public final Counter aiForecastFallbacks;
    public final Counter aiChatCalls;
    public final Counter smsOtpSent;
    public final Counter smsFailed;
    public final Timer   aiForecastLatency;
    public final Counter aiCoachCalls;
    public final Counter aiCoachFallbacks;
    public final Counter aiCoachCacheHits;

    public FinTwinMetrics(MeterRegistry registry) {
        this.loginSuccess       = Counter.builder("fintwin_auth_logins_total")
                .tag("result", "success")
                .description("Successful logins")
                .register(registry);
        this.loginFailure       = Counter.builder("fintwin_auth_logins_total")
                .tag("result", "failure")
                .description("Failed login attempts")
                .register(registry);
        this.registrations      = Counter.builder("fintwin_registrations_total")
                .description("New user registrations")
                .register(registry);
        this.transactionsCreated = Counter.builder("fintwin_transactions_created_total")
                .description("Transactions added by users")
                .register(registry);
        this.aiForecastCalls    = Counter.builder("fintwin_ai_requests_total")
                .tag("type", "forecast").tag("path", "ai")
                .register(registry);
        this.aiForecastFallbacks = Counter.builder("fintwin_ai_requests_total")
                .tag("type", "forecast").tag("path", "fallback")
                .description("Forecast fallbacks — AI service was down")
                .register(registry);
        this.aiChatCalls        = Counter.builder("fintwin_ai_requests_total")
                .tag("type", "chat").tag("path", "ai")
                .register(registry);
        this.smsOtpSent         = Counter.builder("fintwin_sms_total")
                .tag("type", "otp")
                .register(registry);
        this.smsFailed          = Counter.builder("fintwin_sms_total")
                .tag("type", "failed")
                .register(registry);
        this.aiForecastLatency  = Timer.builder("fintwin_ai_forecast_duration_seconds")
                .description("Time taken by the AI forecast endpoint")
                .register(registry);
        this.aiCoachCalls       = Counter.builder("fintwin_ai_requests_total")
                .tag("type", "coach").tag("path", "ai")
                .register(registry);
        this.aiCoachFallbacks   = Counter.builder("fintwin_ai_requests_total")
                .tag("type", "coach").tag("path", "fallback")
                .description("Coach fallbacks — AI service was down or timed out")
                .register(registry);
        this.aiCoachCacheHits   = Counter.builder("fintwin_ai_requests_total")
                .tag("type", "coach").tag("path", "cache")
                .description("Coach responses served from cache — identical transaction window")
                .register(registry);
    }
}
