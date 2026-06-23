package com.fintwin.security;

import com.fintwin.repository.BlockedIPRepository;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Rate limiting filter with two backends:
 * - Redis (distributed): used when REDIS_URL is configured. Correct across all replicas.
 * - In-memory Bucket4j (fallback): used when Redis is not configured. Single-instance only.
 *
 * Uses a fixed-window counter in Redis (INCR + EXPIRE). Window resets every minute.
 * This is intentional — it's simpler and cheaper than sliding windows at this scale.
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);

    @Autowired @Lazy
    private BlockedIPRepository blockedIPRepository;

    @Value("${redis.url:}")
    private String redisUrl;

    // Redis backend (null when Redis is not configured)
    private RedisClient redisClient;
    private StatefulRedisConnection<String, String> redisConn;
    private RedisCommands<String, String> redis;

    // In-memory fallback when Redis is not configured
    private final Map<String, Bucket> localBuckets = new ConcurrentHashMap<>();

    @PostConstruct
    void init() {
        if (redisUrl != null && !redisUrl.isBlank()) {
            try {
                redisClient = RedisClient.create(redisUrl);
                redisConn   = redisClient.connect();
                redis       = redisConn.sync();
                redis.ping(); // fail fast if Redis is unreachable
                log.info("RateLimitFilter: Redis-backed distributed rate limiting enabled");
            } catch (Exception e) {
                log.warn("RateLimitFilter: Redis connection failed ({}). "
                        + "Falling back to in-memory rate limiting — NOT suitable for multi-instance.", e.getMessage());
                closeRedis();
            }
        } else {
            log.info("RateLimitFilter: No REDIS_URL set — using in-memory rate limiting (single-instance only)");
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

        String ip   = getClientIp(request);
        String path = request.getRequestURI();

        // Block listed IPs before rate limiting
        try {
            if (blockedIPRepository != null
                    && blockedIPRepository.isActivelyBlocked(ip, LocalDateTime.now())) {
                reject(response, HttpStatus.FORBIDDEN,
                        "{\"error\":\"Your IP has been blocked. Contact support to appeal.\"}");
                return;
            }
        } catch (Exception ignored) {}

        int limit = limitFor(path);
        boolean allowed = redis != null
                ? checkRedis(ip, path, limit)
                : checkLocal(ip, path, limit);

        if (allowed) {
            chain.doFilter(request, response);
        } else {
            reject(response, HttpStatus.TOO_MANY_REQUESTS,
                    "{\"error\":\"Rate limit exceeded. Try again shortly.\"}");
        }
    }

    // ── Redis fixed-window check ──────────────────────────────────────────────

    private boolean checkRedis(String ip, String path, int limit) {
        try {
            // Key is per-IP, per-endpoint-type, per-minute-window
            long window = System.currentTimeMillis() / 60_000;
            String key  = "rl:" + ip + ":" + bucketKey(path) + ":" + window;
            Long count  = redis.incr(key);
            if (count == 1) redis.expire(key, 120); // 2-minute TTL so key cleans up
            return count <= limit;
        } catch (Exception e) {
            // Redis error — fail open (allow request) rather than blocking all traffic
            log.warn("Redis rate limit check failed, allowing request: {}", e.getMessage());
            return true;
        }
    }

    // ── In-memory Bucket4j fallback ───────────────────────────────────────────

    private boolean checkLocal(String ip, String path, int limit) {
        String key = ip + ":" + bucketKey(path);
        Bucket bucket = localBuckets.computeIfAbsent(key, k ->
                Bucket.builder()
                        .addLimit(Bandwidth.classic(limit, Refill.greedy(limit, Duration.ofMinutes(1))))
                        .build());
        return bucket.tryConsume(1);
    }

    // ── Limit tiers ───────────────────────────────────────────────────────────

    private int limitFor(String path) {
        if (path.contains("/auth"))                                  return 5;
        if (path.contains("/chat") || path.contains("/coach")
                || path.contains("/reports") || path.contains("/goals")
                || path.contains("/investments"))                    return 20;
        return 100;
    }

    private String bucketKey(String path) {
        if (path.contains("/auth"))   return "auth";
        if (path.contains("/chat"))   return "ai";
        return "api";
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static void reject(HttpServletResponse response, HttpStatus status, String body)
            throws IOException {
        response.setStatus(status.value());
        response.setContentType("application/json");
        response.getWriter().write(body);
    }

    private String getClientIp(HttpServletRequest request) {
        String remoteAddr = request.getRemoteAddr();
        if (isTrustedProxy(remoteAddr)) {
            String forwarded = request.getHeader("X-Forwarded-For");
            if (forwarded != null && !forwarded.isBlank())
                return forwarded.split(",")[0].trim();
        }
        return remoteAddr;
    }

    private boolean isTrustedProxy(String addr) {
        if (addr == null) return false;
        return addr.equals("127.0.0.1")
                || addr.equals("::1")
                || addr.startsWith("172.")
                || addr.startsWith("10.")
                || addr.startsWith("192.168.");
    }
}
