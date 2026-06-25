package com.fintwin.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
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

                .setSubject(email)

                .claim("role", role != null ? role : "USER")

                .setIssuedAt(
                        new Date()
                )

                .setExpiration(

                        new Date(

                                System.currentTimeMillis()
                                        + EXPIRATION
                        )
                )

                .signWith(

                        SECRET_KEY,

                        SignatureAlgorithm.HS256
                )

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

                Jwts.parserBuilder()

                        .setSigningKey(
                                SECRET_KEY
                        )

                        .build()

                        .parseClaimsJws(
                                token
                        )

                        .getBody();

        return claims.getSubject();
    }

    // =====================================
    // GENERATE TEMP TOKEN (2FA pending — 5 min)
    // =====================================

    public String generateTempToken(String email) {
        return Jwts.builder()
                .setSubject(email)
                .claim("type", "2fa_pending")
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + 5 * 60 * 1000))
                .signWith(SECRET_KEY, SignatureAlgorithm.HS256)
                .compact();
    }

    // =====================================
    // GENERATE IMPERSONATION TOKEN
    // =====================================

    // Carries imp_by claim so audit logs during the session are traceable to the admin.
    public String generateImpersonationToken(String targetEmail, String adminEmail) {
        return Jwts.builder()
                .setSubject(targetEmail)
                .claim("imp_by", adminEmail)
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + EXPIRATION))
                .signWith(SECRET_KEY, SignatureAlgorithm.HS256)
                .compact();
    }

    // =====================================
    // EXTRACT FULL CLAIMS
    // =====================================

    public Claims extractClaims(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(SECRET_KEY)
                .build()
                .parseClaimsJws(token)
                .getBody();
    }

    // =====================================
    // VALIDATE TOKEN
    // =====================================

    public boolean validateToken(

            String token

    ) {

        try {

            Jwts.parserBuilder()

                    .setSigningKey(
                            SECRET_KEY
                    )

                    .build()

                    .parseClaimsJws(
                            token
                    );

            return true;

        } catch (Exception e) {

            return false;
        }
    }

}