package com.fintwin.identity.service;

import com.fintwin.identity.repository.RefreshTokenRepository;
import com.fintwin.identity.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * Handles the refresh-token-reuse theft signal in its own transaction.
 *
 * {@code TokenService.rotateRefreshToken} throws after detecting reuse, which
 * would roll back the family revocation if it ran in the same transaction —
 * the same trap {@link LoginAttemptRecorder} exists to avoid for lockout.
 */
@Service
public class TokenReuseGuard {

    private static final Logger log = LoggerFactory.getLogger(TokenReuseGuard.class);

    @Autowired private RefreshTokenRepository refreshTokenRepository;
    @Autowired private UserRepository userRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onReuse(Long userId) {
        log.warn("Revoked refresh token reused for user {} — revoking all sessions", userId);
        refreshTokenRepository.revokeAllForUser(userId, LocalDateTime.now());
        userRepository.findById(userId).ifPresent(user -> {
            user.setLastLogoutAt(LocalDateTime.now());
            userRepository.save(user);
        });
    }
}
