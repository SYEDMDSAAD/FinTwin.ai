package com.fintwin.identity.security;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import io.lettuce.core.RedisClient;
import io.lettuce.core.api.StatefulRedisConnection;
import io.lettuce.core.api.sync.RedisCommands;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);

    @Value("${redis.url:}")
    private String redisUrl;

    // Operational kill-switch; also lets test suites avoid limit exhaustion.
    @Value("${rate.limit.enabled:true}")
    private boolean rateLimitEnabled;

    private RedisClient redisClient;
    private StatefulRedisConnection<String, String> redisConn;
    private RedisCommands<String, String> redis;

    private final Map<String, Bucket> localBuckets = new ConcurrentHashMap<>();

    @PostConstruct
    void init() {
        if (redisUrl != null && !redisUrl.isBlank()) {
            try {
                redisClient = RedisClient.create(redisUrl);
                redisConn   = redisClient.connect();
                redis       = redisConn.sync();
                redis.ping();
                log.info("RateLimitFilter: Redis-backed rate limiting enabled");
            } catch (Exception e) {
                log.warn("RateLimitFilter: Redis unavailable, falling back to in-memory: {}", e.getMessage());
                closeRedis();
            }
        } else {
            log.info("RateLimitFilter: in-memory rate limiting (single-instance)");
        }
    }

    @PreDestroy
    void closeRedis() {
        try { if (redisConn != null) redisConn.close(); } catch (Exception ignored) {}
        try { if (redisClient != null) redisClient.shutdown(); } catch (Exception ignored) {}
        redis = null;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        if (!rateLimitEnabled) {
            chain.doFilter(request, response);
            return;
        }
        String ip   = getClientIp(request);
        String path = request.getRequestURI();
        int limit = limitFor(path);

        boolean allowed = redis != null ? checkRedis(ip, path, limit) : checkLocal(ip, path, limit);
        if (allowed) {
            chain.doFilter(request, response);
        } else {
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"Rate limit exceeded. Try again shortly.\"}");
        }
    }

    private boolean checkRedis(String ip, String path, int limit) {
        try {
            long window = System.currentTimeMillis() / 60_000;
            String key  = "rl:id:" + ip + ":" + bucketKey(path) + ":" + window;
            Long count  = redis.incr(key);
            if (count == 1) redis.expire(key, 120);
            return count <= limit;
        } catch (Exception e) {
            log.warn("Redis rate limit error, allowing: {}", e.getMessage());
            return true;
        }
    }

    private boolean checkLocal(String ip, String path, int limit) {
        String key = ip + ":" + bucketKey(path);
        Bucket bucket = localBuckets.computeIfAbsent(key, k ->
                Bucket.builder()
                        .addLimit(Bandwidth.classic(limit, Refill.greedy(limit, Duration.ofMinutes(1))))
                        .build());
        return bucket.tryConsume(1);
    }

    private int limitFor(String path) {
        if (path.contains("/auth") || path.contains("/2fa")) return 10;
        if (path.contains("/token"))                          return 30;
        return 100;
    }

    private String bucketKey(String path) {
        if (path.contains("/auth") || path.contains("/2fa")) return "auth";
        if (path.contains("/token"))                         return "token";
        return "api";
    }

    private String getClientIp(HttpServletRequest request) {
        String addr = request.getRemoteAddr();
        if (isTrustedProxy(addr)) {
            String forwarded = request.getHeader("X-Forwarded-For");
            if (forwarded != null && !forwarded.isBlank()) {
                // Walk from the RIGHT and take the first untrusted hop. The
                // leftmost entry is client-supplied — keying the limiter on it
                // let an attacker rotate fake XFF values and get a fresh
                // bucket per request, defeating login/2FA brute-force limits.
                String[] hops = forwarded.split(",");
                for (int i = hops.length - 1; i >= 0; i--) {
                    String hop = hops[i].trim();
                    if (!hop.isEmpty() && !isTrustedProxy(hop)) return hop;
                }
                // Every hop was a trusted proxy — fall through to remoteAddr
            }
        }
        return addr;
    }

    private boolean isTrustedProxy(String addr) {
        if (addr == null) return false;
        if (addr.equals("127.0.0.1") || addr.equals("::1")
                || addr.startsWith("10.") || addr.startsWith("192.168.")) {
            return true;
        }
        // RFC 1918: only 172.16.0.0/12 is private — a bare startsWith("172.")
        // trusted 172.32+ PUBLIC addresses, letting internet hosts spoof XFF.
        if (addr.startsWith("172.")) {
            String[] parts = addr.split("\\.");
            if (parts.length >= 2) {
                try {
                    int second = Integer.parseInt(parts[1]);
                    return second >= 16 && second <= 31;
                } catch (NumberFormatException ignored) {
                    return false;
                }
            }
        }
        return false;
    }
}
