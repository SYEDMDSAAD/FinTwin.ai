package com.fintwin.identity.security;

import com.fintwin.identity.model.User;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Date;

@Component
public class JwtFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtFilter.class);

    @Autowired private JwtUtil jwtUtil;
    @Autowired private CustomUserDetailsService userDetailsService;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {

        String authHeader = request.getHeader("Authorization");
        String token = null;
        String email = null;

        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7);
            try {
                email = jwtUtil.extractEmail(token);
                log.debug("JWT authenticated: {} {}", request.getMethod(), request.getRequestURI());
            } catch (io.jsonwebtoken.ExpiredJwtException ex) {
                writeUnauthorized(response, "Token expired");
                return;
            } catch (Exception ex) {
                writeUnauthorized(response, "Invalid token");
                return;
            }
        }

        if (email != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            try {
                UserDetails userDetails = userDetailsService.loadUserByUsername(email);

                io.jsonwebtoken.Claims claims = jwtUtil.extractClaims(token);

                // Reject 2FA-pending temp tokens — they may only be exchanged at
                // /2fa/login, never used as access tokens (else 2FA is bypassable).
                if ("2fa_pending".equals(claims.get("type"))) {
                    writeUnauthorized(response, "Invalid token");
                    return;
                }

                Date issuedAt = claims.getIssuedAt();
                User dbUser = userDetailsService.loadUser(email);

                if (dbUser != null && dbUser.getLastLogoutAt() != null && issuedAt != null) {
                    LocalDateTime tokenIssuedAt = issuedAt.toInstant().atZone(ZoneId.systemDefault()).toLocalDateTime();
                    if (tokenIssuedAt.isBefore(dbUser.getLastLogoutAt())) {
                        writeUnauthorized(response, "Session invalidated");
                        return;
                    }
                }

                String impBy = (String) claims.get("imp_by");
                if (impBy != null) {
                    request.setAttribute("imp_by", impBy);
                }

                if (jwtUtil.validateToken(token)) {
                    UsernamePasswordAuthenticationToken authToken =
                            new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());
                    authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(authToken);
                }

            } catch (UsernameNotFoundException ex) {
                writeUnauthorized(response, "Invalid token");
                return;
            } catch (Exception ex) {
                writeUnauthorized(response, "Authentication failed");
                return;
            }
        }

        chain.doFilter(request, response);
    }

    private void writeUnauthorized(HttpServletResponse response, String message) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"" + message + "\"}");
    }
}
