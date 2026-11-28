package com.fintwin.identity.service;

import com.fintwin.identity.model.User;
import com.fintwin.identity.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Nightly: removes sign-ups nobody finished — never verified, never logged
 * in, never onboarded — once they're older than the retention window. They
 * can't log in and hold no data; left alone they only squat the email.
 *
 * One row at a time, so a row something else still points at is skipped
 * (and logged) rather than failing the whole run.
 */
@Component
public class UnverifiedSignupCleanup {

    private static final Logger log = LoggerFactory.getLogger(UnverifiedSignupCleanup.class);
    static final int BATCH = 200;

    private final UserRepository users;
    private final int retentionDays;

    public UnverifiedSignupCleanup(UserRepository users,
                                   @Value("${identity.unverified-retention-days:7}") int retentionDays) {
        this.users = users;
        this.retentionDays = Math.max(2, retentionDays);
    }

    @Scheduled(cron = "${identity.unverified-cleanup-cron:0 30 3 * * *}", zone = "Asia/Kolkata")
    public void nightly() {
        try {
            run(LocalDateTime.now());
        } catch (Exception e) {
            log.error("Unverified sign-up cleanup failed", e);
        }
    }

    /** @return how many were removed */
    public int run(LocalDateTime now) {
        List<User> stale = users.findAbandonedSignups(now.minusDays(retentionDays), PageRequest.of(0, BATCH));
        int removed = 0;
        for (User u : stale) {
            // Checked again here, not only in the query: never remove a real account
            if (!AuthService.isAbandonedSignup(u)) continue;
            try {
                users.deleteById(u.getId());
                removed++;
            } catch (DataIntegrityViolationException e) {
                log.warn("Unverified sign-up #{} kept: other rows still refer to it", u.getId());
            }
        }
        if (removed > 0) log.info("Removed {} unverified sign-ups older than {} days", removed, retentionDays);
        return removed;
    }
}
