package com.fintwin.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Component
public class JwtUtil {

    @Value("${jwt.secret}")
    private String jwtSecret;

    private SecretKey SECRET_KEY;

    @PostConstruct
    private void init() {
        SECRET_KEY = Keys.hmacShaKeyFor(
                jwtSecret.getBytes(StandardCharsets.UTF_8)
        );
    }

    private final long EXPIRATION =

            1000 * 60 * 60 * 24; // 24 Hours

    // =====================================
    // GENERATE TOKEN
    // =====================================

    public String generateToken(String email) {
        return generateToken(email, "USER");
    }

    public String generateToken(String email, String role) {

        return Jwts.builder()

                .subject(email)

                .claim("role", role != null ? role : "USER")

                .issuedAt(
                        new Date()
                )

                .expiration(

                        new Date(

                                System.currentTimeMillis()
                                        + EXPIRATION
                        )
                )

                .signWith(SECRET_KEY)

                .compact();
    }

    public String extractRole(String token) {
        Claims claims = extractClaims(token);
        String role = (String) claims.get("role");
        return role != null ? role : "USER";
    }

    // =====================================
    // EXTRACT EMAIL
    // =====================================

    public String extractEmail(

            String token

    ) {

        Claims claims =

                Jwts.parser()

                        .verifyWith(
                                SECRET_KEY
                        )

                        .build()

                        .parseSignedClaims(
                                token
                        )

                        .getPayload();

        return claims.getSubject();
    }

    // =====================================
    // GENERATE TEMP TOKEN (2FA pending — 5 min)
    // =====================================

    public String generateTempToken(String email) {
        return Jwts.builder()
                .subject(email)
                .claim("type", "2fa_pending")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 5 * 60 * 1000))
                .signWith(SECRET_KEY)
                .compact();
    }

    // =====================================
    // GENERATE IMPERSONATION TOKEN
    // =====================================

    // Carries imp_by claim so audit logs during the session are traceable to the admin.
    public String generateImpersonationToken(String targetEmail, String adminEmail) {
        return Jwts.builder()
                .subject(targetEmail)
                .claim("imp_by", adminEmail)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + EXPIRATION))
                .signWith(SECRET_KEY)
                .compact();
    }

    // =====================================
    // EXTRACT FULL CLAIMS
    // =====================================

    public Claims extractClaims(String token) {
        return Jwts.parser()
                .verifyWith(SECRET_KEY)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    // =====================================
    // VALIDATE TOKEN
    // =====================================

    public boolean validateToken(

            String token

    ) {

        try {

            Jwts.parser()

                    .verifyWith(
                            SECRET_KEY
                    )

                    .build()

                    .parseSignedClaims(
                            token
                    );

            return true;

        } catch (Exception e) {

            return false;
        }
    }

}