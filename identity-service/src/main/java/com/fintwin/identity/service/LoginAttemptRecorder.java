package com.fintwin.identity.service;

import com.fintwin.identity.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

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

    // REQUIRES_NEW: callers inside @Transactional methods (2FA login, email
    // OTP verify) throw right after recording — an ambient transaction would
    // roll the increment back, exactly the bug this class exists to prevent.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFailure(Long userId) {
        userRepository.registerFailedLogin(
                userId, MAX_FAILED_ATTEMPTS, LocalDateTime.now().plusMinutes(LOCKOUT_MINUTES));
    }
}
