package com.fintwin.repository;

import com.fintwin.model.User;
import com.fintwin.security.EmailHashUtil;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    // Spring Data derives: WHERE email_hash = :emailHash
    Optional<User> findByEmailHash(String emailHash);

    // All callers use this — hashing is transparent, no call sites change
    default Optional<User> findByEmail(String email) {
        if (email == null) return Optional.empty();
        return findByEmailHash(EmailHashUtil.hash(email));
    }

    long countByEnabledTrue();

    long countByCreatedAtAfter(LocalDateTime date);

    long countByTwoFactorEnabledTrue();

    long countByOnboardingCompletedTrue();

    // DB-level role count — avoids loading all users into memory for admin stats
    @org.springframework.data.jpa.repository.Query("SELECT COUNT(u) FROM User u WHERE u.role = :role")
    long countByRole(@org.springframework.data.repository.query.Param("role") String role);

    // Paginated list for admin panel — avoids loading all users into memory
    org.springframework.data.domain.Page<User> findAll(org.springframework.data.domain.Pageable pageable);

    // Used by signup trend — avoids loading all users when only recently created ones are needed
    java.util.List<User> findByCreatedAtAfter(LocalDateTime date);
}
