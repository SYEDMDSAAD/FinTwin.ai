package com.fintwin.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.fintwin.model.User;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Date;

@Component
public class JwtFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtFilter.class);

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private CustomUserDetailsService userDetailsService;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {

        String authHeader = request.getHeader("Authorization");

        // No bearer token — let the chain decide (public endpoints) or reject later.
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = authHeader.substring(7);

        // Parse once: this validates the signature and expiry and yields the claims.
        io.jsonwebtoken.Claims claims;
        try {
            claims = jwtUtil.extractClaims(token);
        } catch (io.jsonwebtoken.ExpiredJwtException ex) {
            writeUnauthorized(response, "Token expired");
            return;
        } catch (Exception ex) {
            writeUnauthorized(response, "Invalid token");
            return;
        }

        String email = claims.getSubject();

        if (email != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            try {
                // Single DB lookup, reused for the force-logout check and authorities.
                User dbUser = userDetailsService.loadUser(email);
                if (dbUser == null) {
                    writeUnauthorized(response, "Invalid token");
                    return;
                }

                // Reject tokens for accounts that have since been disabled.
                if (!Boolean.TRUE.equals(dbUser.getEnabled())) {
                    writeUnauthorized(response, "Account disabled");
                    return;
                }

                // Force-logout: reject tokens issued before the user's last logout.
                Date issuedAt = claims.getIssuedAt();
                if (dbUser.getLastLogoutAt() != null && issuedAt != null) {
                    LocalDateTime tokenIssuedAt = issuedAt.toInstant()
                            .atZone(ZoneId.systemDefault()).toLocalDateTime();
                    if (tokenIssuedAt.isBefore(dbUser.getLastLogoutAt())) {
                        writeUnauthorized(response, "Session invalidated");
                        return;
                    }
                }

                // Expose impersonation context so audit logs attribute to the admin.
                String impBy = (String) claims.get("imp_by");
                if (impBy != null) {
                    request.setAttribute("imp_by", impBy);
                }

                UserDetails userDetails = userDetailsService.buildUserDetails(dbUser);

                UsernamePasswordAuthenticationToken authToken =
                        new UsernamePasswordAuthenticationToken(
                                userDetails, null, userDetails.getAuthorities());
                authToken.setDetails(
                        new WebAuthenticationDetailsSource().buildDetails(request));

                SecurityContextHolder.getContext().setAuthentication(authToken);

                log.debug("JWT authenticated: {} {}", request.getMethod(), request.getRequestURI());

            } catch (Exception ex) {
                writeUnauthorized(response, "Authentication failed");
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private void writeUnauthorized(HttpServletResponse response, String message) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"" + message + "\"}");
    }
}
