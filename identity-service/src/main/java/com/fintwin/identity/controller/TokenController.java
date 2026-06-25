package com.fintwin.identity.controller;

import com.fintwin.identity.dto.TokenIntrospectResponse;
import com.fintwin.identity.model.User;
import com.fintwin.identity.repository.UserRepository;
import com.fintwin.identity.security.JwtUtil;
import io.jsonwebtoken.Claims;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * Internal endpoint for resource servers (main backend, AI service) to validate
 * an access token and get user info without needing the JWT secret directly.
 * Protected by X-Internal-Key header — never exposed publicly.
 */
@RestController
@RequestMapping("/api/token")
public class TokenController {

    @Autowired private JwtUtil jwtUtil;
    @Autowired private UserRepository userRepository;

    @Value("${internal.key:}")
    private String internalKey;

    @PostMapping("/introspect")
    public ResponseEntity<TokenIntrospectResponse> introspect(
            @RequestHeader(value = "X-Internal-Key", required = false) String key,
            @RequestBody java.util.Map<String, String> body) {

        if (internalKey != null && !internalKey.isBlank() && !internalKey.equals(key)) {
            return ResponseEntity.status(403)
                    .body(TokenIntrospectResponse.invalid("Unauthorized"));
        }

        String token = body.get("token");
        if (token == null || token.isBlank())
            return ResponseEntity.badRequest().body(TokenIntrospectResponse.invalid("Token required"));

        try {
            Claims claims = jwtUtil.extractClaims(token);
            String email = claims.getSubject();

            User user = userRepository.findByEmail(email).orElse(null);
            if (user == null)
                return ResponseEntity.ok(TokenIntrospectResponse.invalid("User not found"));

            if (!Boolean.TRUE.equals(user.getEnabled()))
                return ResponseEntity.ok(TokenIntrospectResponse.invalid("Account disabled"));

            // Force-logout check
            if (user.getLastLogoutAt() != null && claims.getIssuedAt() != null) {
                LocalDateTime issuedAt = claims.getIssuedAt().toInstant()
                        .atZone(ZoneId.systemDefault()).toLocalDateTime();
                if (issuedAt.isBefore(user.getLastLogoutAt()))
                    return ResponseEntity.ok(TokenIntrospectResponse.invalid("Session invalidated"));
            }

            String impBy = (String) claims.get("imp_by");
            return ResponseEntity.ok(TokenIntrospectResponse.valid(
                email, user.getRole(), user.getFullName(), user.getOnboardingCompleted(), impBy));

        } catch (io.jsonwebtoken.ExpiredJwtException e) {
            return ResponseEntity.ok(TokenIntrospectResponse.invalid("Token expired"));
        } catch (Exception e) {
            return ResponseEntity.ok(TokenIntrospectResponse.invalid("Invalid token"));
        }
    }
}
