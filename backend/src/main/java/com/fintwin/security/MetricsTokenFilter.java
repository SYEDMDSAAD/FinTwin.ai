package com.fintwin.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Guards /actuator/prometheus with a bearer token (METRICS_TOKEN).
 *
 * The endpoint is permitAll in SecurityConfig because Prometheus and Grafana
 * Cloud don't carry a user JWT. That was safe while it was only reachable on
 * the internal network; on App Service the backend has a public URL, so the
 * scraper must present the token instead. With no token configured the
 * endpoint answers 404: closed unless monitoring is deliberately set up.
 */
@Component
public class MetricsTokenFilter extends OncePerRequestFilter {

    static final String PATH = "/actuator/prometheus";

    private final byte[] expected;

    public MetricsTokenFilter(@Value("${metrics.token:}") String token) {
        this.expected = token.isBlank() ? null : ("Bearer " + token).getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !PATH.equals(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (expected == null) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }
        String header = request.getHeader("Authorization");
        byte[] given = header == null ? new byte[0] : header.getBytes(StandardCharsets.UTF_8);
        // Constant-time, so response timing doesn't reveal the token
        if (!MessageDigest.isEqual(expected, given)) {
            response.setHeader("WWW-Authenticate", "Bearer");
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }
        chain.doFilter(request, response);
    }
}
