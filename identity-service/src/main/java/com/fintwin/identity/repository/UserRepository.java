package com.fintwin.identity.repository;

import com.fintwin.identity.model.User;
import com.fintwin.identity.security.EmailHashUtil;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

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
