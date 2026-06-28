package com.fintwin.identity.repository;

import com.fintwin.identity.model.User;
import com.fintwin.identity.security.EmailHashUtil;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    /**
     * Atomically increments the failed-login counter and sets the lockout
     * timestamp when the threshold is reached, in a single committed statement.
     * Done as a direct UPDATE (not entity save) so it persists even when the
     * caller later throws — account lockout must survive the failed-login path.
     */
    @Modifying
    @Transactional
    @Query("UPDATE User u SET u.failedLoginAttempts = COALESCE(u.failedLoginAttempts, 0) + 1, "
         + "u.lockedUntil = CASE WHEN COALESCE(u.failedLoginAttempts, 0) + 1 >= :max "
         + "THEN :until ELSE u.lockedUntil END "
         + "WHERE u.id = :id")
    void registerFailedLogin(@Param("id") Long id, @Param("max") int max, @Param("until") LocalDateTime until);

    Optional<User> findByEmailHash(String emailHash);

    default Optional<User> findByEmail(String email) {
        if (email == null) return Optional.empty();
        return findByEmailHash(EmailHashUtil.hash(email));
    }

    Optional<User> findByPasswordResetToken(String hashedToken);

    Page<User> findAll(Pageable pageable);

    long countByEnabledTrue();

    long countByCreatedAtAfter(LocalDateTime date);

    long countByTwoFactorEnabledTrue();

    long countByOnboardingCompletedTrue();

    @Query("SELECT COUNT(u) FROM User u WHERE u.role = :role")
    long countByRole(@Param("role") String role);

    List<User> findByCreatedAtAfter(LocalDateTime date);
}
