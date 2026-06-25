package com.fintwin.identity.service;

import com.fintwin.identity.model.RefreshToken;
import com.fintwin.identity.model.User;
import com.fintwin.identity.repository.RefreshTokenRepository;
import com.fintwin.identity.security.JwtUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.UUID;

@Service
public class TokenService {

    private static final Logger log = LoggerFactory.getLogger(TokenService.class);
    private static final int REFRESH_TOKEN_DAYS = 7;

    @Autowired private JwtUtil jwtUtil;
    @Autowired private RefreshTokenRepository refreshTokenRepository;

    public String issueAccessToken(String email) {
        return jwtUtil.generateAccessToken(email);
    }

    @Transactional
    public String issueRefreshToken(User user) {
        String rawToken = UUID.randomUUID().toString();
        RefreshToken rt = new RefreshToken();
        rt.setUser(user);
        rt.setTokenHash(sha256(rawToken));
        rt.setIssuedAt(LocalDateTime.now());
        rt.setExpiresAt(LocalDateTime.now().plusDays(REFRESH_TOKEN_DAYS));
        refreshTokenRepository.save(rt);
        return rawToken;
    }

    // Validates refresh token and returns a new access token.
    // Rotates the refresh token (revoke old, issue new) for forward secrecy.
    @Transactional
    public RefreshResult rotateRefreshToken(String rawRefreshToken) {
        String hash = sha256(rawRefreshToken);
        RefreshToken stored = refreshTokenRepository.findByTokenHash(hash)
                .orElseThrow(() -> new SecurityException("Invalid refresh token"));

        if (stored.isRevoked())
            throw new SecurityException("Refresh token has been revoked");

        if (stored.getExpiresAt().isBefore(LocalDateTime.now()))
            throw new SecurityException("Refresh token has expired");

        // Revoke the used token
        stored.setRevoked(true);
        stored.setRevokedAt(LocalDateTime.now());
        refreshTokenRepository.save(stored);

        User user = stored.getUser();
        String newAccessToken  = jwtUtil.generateAccessToken(user.getEmail());
        String newRefreshToken = issueRefreshToken(user);

        return new RefreshResult(newAccessToken, newRefreshToken);
    }

    @Transactional
    public void revokeRefreshToken(String rawRefreshToken) {
        String hash = sha256(rawRefreshToken);
        refreshTokenRepository.findByTokenHash(hash).ifPresent(rt -> {
            rt.setRevoked(true);
            rt.setRevokedAt(LocalDateTime.now());
            refreshTokenRepository.save(rt);
        });
    }

    @Transactional
    public void revokeAllForUser(Long userId) {
        refreshTokenRepository.revokeAllForUser(userId, LocalDateTime.now());
    }

    // Purge expired and revoked tokens daily
    @Scheduled(cron = "0 0 3 * * *")
    @Transactional
    public void purgeExpiredTokens() {
        refreshTokenRepository.deleteExpiredAndRevoked(LocalDateTime.now());
        log.info("Purged expired/revoked refresh tokens");
    }

    private String sha256(String input) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            throw new RuntimeException("SHA-256 unavailable", e);
        }
    }

    public record RefreshResult(String accessToken, String refreshToken) {}
}
