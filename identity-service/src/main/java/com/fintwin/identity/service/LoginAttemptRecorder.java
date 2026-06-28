package com.fintwin.identity.service;

import com.fintwin.identity.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * Records failed-login bookkeeping via an atomic, independently-committed UPDATE.
 *
 * {@code AuthService.login} throws after a bad password, so the increment must
 * not depend on that method's transaction (it would be rolled back, leaving
 * account lockout permanently disengaged).
 */
@Service
public class LoginAttemptRecorder {

    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final int LOCKOUT_MINUTES     = 15;

    @Autowired private UserRepository userRepository;

    public void recordFailure(Long userId) {
        userRepository.registerFailedLogin(
                userId, MAX_FAILED_ATTEMPTS, LocalDateTime.now().plusMinutes(LOCKOUT_MINUTES));
    }
}
