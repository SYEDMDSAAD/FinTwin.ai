package com.fintwin.controller;

import com.fintwin.audit.AuditLogRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import io.micrometer.core.instrument.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin/metrics")
@PreAuthorize("hasRole('ADMIN') or hasRole('SUPER_ADMIN')")
public class AdminMetricsController {

    @Autowired private MeterRegistry registry;
    @Autowired private AuditLogRepository auditLogRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private TransactionRepository transactionRepository;

    @GetMapping("/live")
    public Map<String, Object> live() {
        Map<String, Object> m = new LinkedHashMap<>();

        // ── Auth & Activity — sourced from audit_log/DB, not in-memory counters ─
        LocalDateTime todayStart = LocalDate.now().atStartOfDay();
        m.put("loginSuccess",    auditLogRepository.countSuccessfulLoginsAfter(todayStart));
        m.put("loginFailure",    auditLogRepository.countFailedLoginsAfter(todayStart));
        m.put("registrations",   userRepository.count());

        // ── Transactions ──────────────────────────────────────────────────────
        m.put("transactionsCreated", transactionRepository.count());

        // ── AI ────────────────────────────────────────────────────────────────
        m.put("aiForecastCalls",     counter("fintwin_ai_requests_total", "type", "forecast", "path", "ai"));
        m.put("aiForecastFallbacks", counter("fintwin_ai_requests_total", "type", "forecast", "path", "fallback"));
        m.put("aiChatCalls",         counter("fintwin_ai_requests_total", "type", "chat",     "path", "ai"));
        m.put("aiForecastP99Ms",     timerP99Ms("fintwin_ai_forecast_duration_seconds"));

        // ── SMS ───────────────────────────────────────────────────────────────
        m.put("smsOtpSent", counter("fintwin_sms_total", "type", "otp"));
        m.put("smsFailed",  counter("fintwin_sms_total", "type", "failed"));

        // ── JVM ───────────────────────────────────────────────────────────────
        double heapUsed = gauge("jvm.memory.used", "area", "heap");
        double heapMax  = gauge("jvm.memory.max",  "area", "heap");
        m.put("jvmHeapUsedMb",  mb(heapUsed));
        m.put("jvmHeapMaxMb",   mb(heapMax));
        m.put("jvmHeapUsedPct", heapMax > 0 ? Math.round(heapUsed / heapMax * 100) : 0);

        // ── HikariCP ──────────────────────────────────────────────────────────
        m.put("dbActive",  (long) gauge("hikaricp.connections.active",  "pool", "FintwinPool"));
        m.put("dbPending", (long) gauge("hikaricp.connections.pending", "pool", "FintwinPool"));
        m.put("dbMax",     (long) gauge("hikaricp.connections.max",     "pool", "FintwinPool"));

        // ── HTTP ──────────────────────────────────────────────────────────────
        m.put("httpTotal",    httpTotal());
        m.put("httpErrors",   httpErrors());
        m.put("httpP99Ms",    httpP99Ms());

        // ── Process ───────────────────────────────────────────────────────────
        m.put("uptimeSeconds", (long) gauge("process.uptime"));
        m.put("cpuUsagePct",   Math.round(gauge("process.cpu.usage") * 100));

        // ── Circuit breaker ───────────────────────────────────────────────────
        m.put("circuitBreakerState", circuitBreakerState("ai-service"));

        return m;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private double counter(String name, String... tags) {
        try {
            Counter c = registry.find(name).tags(tags).counter();
            return c != null ? Math.round(c.count() * 10.0) / 10.0 : 0;
        } catch (Exception e) { return 0; }
    }

    private double gauge(String name, String... tags) {
        try {
            Gauge g = registry.find(name).tags(tags).gauge();
            if (g == null) return 0;
            double v = g.value();
            return Double.isNaN(v) ? 0 : v;
        } catch (Exception e) { return 0; }
    }

    private long mb(double bytes) {
        return Math.round(bytes / (1024 * 1024));
    }

    private double timerP99Ms(String name) {
        try {
            Timer t = registry.find(name).timer();
            if (t == null) return 0;
            double p99 = t.percentile(0.99, TimeUnit.SECONDS);
            return Double.isNaN(p99) ? 0 : Math.round(p99 * 1000.0) / 1.0;
        } catch (Exception e) { return 0; }
    }

    private long httpTotal() {
        try {
            return registry.find("http.server.requests").timers().stream()
                    .mapToLong(Timer::count).sum();
        } catch (Exception e) { return 0; }
    }

    private long httpErrors() {
        try {
            return registry.find("http.server.requests").timers().stream()
                    .filter(t -> {
                        String status = t.getId().getTag("status");
                        return status != null && status.startsWith("5");
                    })
                    .mapToLong(Timer::count).sum();
        } catch (Exception e) { return 0; }
    }

    private double httpP99Ms() {
        try {
            return registry.find("http.server.requests").timers().stream()
                    .mapToDouble(t -> t.percentile(0.99, TimeUnit.SECONDS))
                    .filter(v -> !Double.isNaN(v))
                    .max().orElse(0) * 1000;
        } catch (Exception e) { return 0; }
    }

    private String circuitBreakerState(String name) {
        try {
            Gauge g = registry.find("resilience4j.circuitbreaker.state")
                    .tag("name", name).gauge();
            if (g == null) return "UNKNOWN";
            // Resilience4j: 0=CLOSED, 1=OPEN, 2=HALF_OPEN
            int state = (int) g.value();
            return switch (state) {
                case 0 -> "CLOSED";
                case 1 -> "OPEN";
                case 2 -> "HALF_OPEN";
                default -> "UNKNOWN";
            };
        } catch (Exception e) { return "UNKNOWN"; }
    }
}
