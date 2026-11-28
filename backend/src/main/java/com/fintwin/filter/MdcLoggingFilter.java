package com.fintwin.filter;

import com.fintwin.security.JwtUtil;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.UUID;

/**
 * Injects per-request context into SLF4J MDC so every log line carries:
 *   requestId — short UUID for correlating logs within a single request
 *   userId    — email of the authenticated user (when JWT is present)
 *
 * traceId and spanId are injected automatically by micrometer-tracing-bridge-brave
 * and appear in logs via %X{traceId} / the LogstashEncoder includeMdcKeyName config.
 */
@Component
@Order(1)
public class MdcLoggingFilter implements Filter {

    @Autowired
    private JwtUtil jwtUtil;

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {

        MDC.put("requestId", UUID.randomUUID().toString().replace("-", "").substring(0, 12));

        String authHeader = ((HttpServletRequest) req).getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            try {
                String email = jwtUtil.extractEmail(authHeader.substring(7));
                if (email != null) MDC.put("userRef", userRef(email));
            } catch (Exception ignored) {
                // Invalid/expired token — MDC userId left unset; Spring Security will reject it anyway
            }
        }

        try {
            chain.doFilter(req, res);
        } finally {
            MDC.clear();
        }
    }

    /**
     * The user as logs show them: the first 12 characters of the keyed email
     * hash stored in users.email_hash. Enough to follow one user's requests
     * and to find them from the database, but the log names nobody.
     */
    static String userRef(String email) {
        String h = com.fintwin.security.EmailHashUtil.hash(email);
        return h == null ? null : h.substring(0, Math.min(12, h.length())).replace('+', '-').replace('/', '_');
    }
}
