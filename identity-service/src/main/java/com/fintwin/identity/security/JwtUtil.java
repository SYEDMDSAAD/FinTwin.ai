package com.fintwin.identity.security;

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

    // Access token: 15 minutes. Refresh tokens (7 days) are managed by TokenService.
    private static final long ACCESS_TOKEN_EXPIRY = 1000L * 60 * 15;
    // Temp token for 2FA pending: 5 minutes
    private static final long TEMP_TOKEN_EXPIRY = 1000L * 60 * 5;

    @PostConstruct
    private void init() {
        SECRET_KEY = Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
    }

    public String generateAccessToken(String email) {
        return Jwts.builder()
                .setSubject(email)
                .claim("type", "access")
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + ACCESS_TOKEN_EXPIRY))
                .signWith(SECRET_KEY, SignatureAlgorithm.HS256)
                .compact();
    }

    public String generateTempToken(String email) {
        return Jwts.builder()
                .setSubject(email)
                .claim("type", "2fa_pending")
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + TEMP_TOKEN_EXPIRY))
                .signWith(SECRET_KEY, SignatureAlgorithm.HS256)
                .compact();
    }

    public String generateImpersonationToken(String targetEmail, String adminEmail) {
        return Jwts.builder()
                .setSubject(targetEmail)
                .claim("type", "access")
                .claim("imp_by", adminEmail)
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + ACCESS_TOKEN_EXPIRY))
                .signWith(SECRET_KEY, SignatureAlgorithm.HS256)
                .compact();
    }

    public String extractEmail(String token) {
        return extractClaims(token).getSubject();
    }

    public Claims extractClaims(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(SECRET_KEY)
                .build()
                .parseClaimsJws(token)
                .getBody();
    }

    public boolean validateToken(String token) {
        try {
            Jwts.parserBuilder().setSigningKey(SECRET_KEY).build().parseClaimsJws(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
