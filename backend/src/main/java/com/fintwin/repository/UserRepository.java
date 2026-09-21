package com.fintwin.repository;

import com.fintwin.model.User;
import com.fintwin.security.EmailHashUtil;
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

    long countByEnabledTrue();
    long countByCreatedAtAfter(LocalDateTime date);
    long countByTwoFactorEnabledTrue();
    long countByOnboardingCompletedTrue();

    @Query("SELECT COUNT(u) FROM User u WHERE u.role = :role")
    long countByRole(@Param("role") String role);

    // Enabled admins to notify on security alerts.
    @Query("SELECT u FROM User u WHERE u.role IN :roles AND u.enabled = true")
    List<User> findEnabledByRoleIn(@Param("roles") List<String> roles);

    // 1 round-trip to Supabase instead of 4 COUNT queries for admin stats
    @Query(value = "SELECT COUNT(*), COUNT(*) FILTER (WHERE enabled = true), COUNT(*) FILTER (WHERE created_at > :weekAgo), COUNT(*) FILTER (WHERE role = 'ADMIN') FROM users",
           nativeQuery = true)
    List<Object[]> countUserStats(@Param("weekAgo") LocalDateTime weekAgo);

    // 1 round-trip instead of 3 COUNT queries for adoption stats
    @Query(value = "SELECT COUNT(*), COUNT(*) FILTER (WHERE two_factor_enabled = true), COUNT(*) FILTER (WHERE onboarding_completed = true) FROM users",
           nativeQuery = true)
    List<Object[]> countAdoptionStats();

    org.springframework.data.domain.Page<User> findAll(org.springframework.data.domain.Pageable pageable);

    List<User> findByCreatedAtAfter(LocalDateTime date);

    Optional<User> findByPasswordResetToken(String hashedToken);

    Optional<User> findByIngestToken(String ingestToken);
}
