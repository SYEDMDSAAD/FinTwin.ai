package com.fintwin.audit;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

/**
 * PCI-DSS Requirement 10: Audit log repository.
 *
 * IMPORTANT — DB user permissions:
 * The application DB user must have INSERT-only access on audit_log.
 * No UPDATE or DELETE must be granted. Enforce this at DB level:
 *
 *   REVOKE UPDATE, DELETE ON audit_log FROM fintwin_app_user;
 *   GRANT INSERT, SELECT ON audit_log TO fintwin_app_user;
 *
 * All query methods below are added for PCI-DSS compliance reporting.
 * Without these, audit data is stored but not actionable.
 */
public interface AuditLogRepository
        extends JpaRepository<AuditLog, Long> {

    // ── PCI-DSS 10.2.1: Individual user accountability ─────────────────────

    /**
     * All audit events for a specific user, newest first.
     * Used for user-level incident investigation.
     */
    List<AuditLog> findByUserIdOrderByTimestampDesc(Long userId);

    /**
     * Paginated audit events for a user.
     * Use this for the profile "activity log" UI.
     */
    Page<AuditLog> findByUserId(Long userId, Pageable pageable);

    // ── PCI-DSS 10.2.4: Invalid logical access attempts ────────────────────

    /**
     * All failed events — login failures, unauthorized access attempts.
     * PCI-DSS requires these to be reviewable.
     */
    List<AuditLog> findBySuccessFalseOrderByTimestampDesc();

    /**
     * Failed events for a specific user.
     * Used to detect brute-force or account enumeration.
     */
    List<AuditLog> findByUserIdAndSuccessFalseOrderByTimestampDesc(Long userId);

    // ── PCI-DSS 10.2.5: Use of privileged accounts ─────────────────────────

    /**
     * All events matching a specific action type.
     * e.g. action = "DELETE" shows all deletions.
     */
    List<AuditLog> findByActionOrderByTimestampDesc(String action);

    /**
     * Events for a specific action on a specific resource.
     * e.g. action = "DELETE", resource = "transactions"
     */
    List<AuditLog> findByActionAndResourceOrderByTimestampDesc(
            String action, String resource
    );

    // ── PCI-DSS 10.7: Retain audit logs for at least 12 months ────────────

    /**
     * All events within a time window.
     * Used for monthly compliance reports and log retention checks.
     */
    List<AuditLog> findByTimestampBetweenOrderByTimestampDesc(
            LocalDateTime from, LocalDateTime to
    );

    /**
     * Events for a user within a time window.
     * Used for per-user activity reports.
     */
    List<AuditLog> findByUserIdAndTimestampBetweenOrderByTimestampDesc(
            Long userId, LocalDateTime from, LocalDateTime to
    );

    // ── Incident response queries ───────────────────────────────────────────

    /**
     * All events from a specific IP address.
     * Used for detecting coordinated attacks from a single source.
     */
    List<AuditLog> findByIpAddressOrderByTimestampDesc(String ipAddress);

    /**
     * Count failed login attempts from an IP within a time window.
     * Used for IP-based brute force detection.
     */
    @Query("""
        SELECT COUNT(a) FROM AuditLog a
        WHERE a.ipAddress = :ip
          AND a.action = 'LOGIN'
          AND a.success = false
          AND a.timestamp >= :since
    """)
    long countFailedLoginsByIp(
            @Param("ip") String ipAddress,
            @Param("since") LocalDateTime since
    );

    /**
     * Count failed login attempts for a user within a time window.
     * Used for per-account brute force detection.
     */
    @Query("""
        SELECT COUNT(a) FROM AuditLog a
        WHERE a.userId = :userId
          AND a.action = 'LOGIN'
          AND a.success = false
          AND a.timestamp >= :since
    """)
    long countFailedLoginsByUser(
            @Param("userId") Long userId,
            @Param("since") LocalDateTime since
    );

    /**
     * All DELETE events across all users in a time window.
     * Used for daily deletion audit in PCI compliance reports.
     */
    @Query("""
        SELECT a FROM AuditLog a
        WHERE a.action = 'DELETE'
          AND a.timestamp BETWEEN :from AND :to
        ORDER BY a.timestamp DESC
    """)
    List<AuditLog> findAllDeletionEvents(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to
    );

    /**
     * Oldest audit log entry.
     * Used to verify the 12-month retention requirement is being met.
     */
    @Query("SELECT a FROM AuditLog a ORDER BY a.timestamp ASC LIMIT 1")
    AuditLog findOldestEntry();

    /**
     * Count total events in a time range.
     * Used for compliance dashboards.
     */
    @Query("""
        SELECT COUNT(a) FROM AuditLog a
        WHERE a.timestamp BETWEEN :from AND :to
    """)
    long countEventsInRange(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to
    );

    Page<AuditLog> findAllByOrderByTimestampDesc(Pageable pageable);

    Page<AuditLog> findByActionOrderByTimestampDesc(String action, Pageable pageable);

    @Query("SELECT COUNT(a) FROM AuditLog a WHERE a.action = 'LOGIN' AND a.success = false AND a.timestamp >= :since")
    long countFailedLoginsAfter(@Param("since") LocalDateTime since);

    long count();

    // ── Security analytics ────────────────────────────────────────────────────

    @Query("SELECT a.ipAddress, COUNT(a) as cnt FROM AuditLog a WHERE a.action = 'LOGIN' AND a.success = false AND a.timestamp >= :since AND a.ipAddress IS NOT NULL GROUP BY a.ipAddress HAVING COUNT(a) >= :threshold ORDER BY cnt DESC")
    List<Object[]> findBruteForceIPs(@Param("since") LocalDateTime since, @Param("threshold") long threshold);

    @Query("SELECT a.userId, COUNT(a) as cnt FROM AuditLog a WHERE a.action = 'LOGIN' AND a.success = false AND a.timestamp >= :since AND a.userId IS NOT NULL GROUP BY a.userId HAVING COUNT(a) >= :threshold ORDER BY cnt DESC")
    List<Object[]> findTargetedUsers(@Param("since") LocalDateTime since, @Param("threshold") long threshold);

    @Query("SELECT a.userId, COUNT(DISTINCT a.ipAddress) as ipCount FROM AuditLog a WHERE a.action = 'LOGIN' AND a.success = true AND a.timestamp >= :since AND a.userId IS NOT NULL GROUP BY a.userId HAVING COUNT(DISTINCT a.ipAddress) > 1 ORDER BY ipCount DESC")
    List<Object[]> findSuspiciousSessions(@Param("since") LocalDateTime since);

    @Query("SELECT a.userId, COUNT(a) as cnt FROM AuditLog a WHERE a.action = 'READ' AND a.timestamp >= :since AND a.userId IS NOT NULL GROUP BY a.userId HAVING COUNT(a) >= :threshold ORDER BY cnt DESC")
    List<Object[]> findHighReadVolume(@Param("since") LocalDateTime since, @Param("threshold") long threshold);

    @Query("SELECT DISTINCT a.ipAddress FROM AuditLog a WHERE a.action = 'LOGIN' AND a.success = false AND a.timestamp >= :since AND a.ipAddress IS NOT NULL")
    List<String> findRecentFailedLoginIPs(@Param("since") LocalDateTime since);

    // ── Retention / archival ──────────────────────────────────────────────────

    /**
     * Hard-delete audit entries older than the retention cutoff.
     * Called by AuditRetentionService on a nightly schedule.
     * Requires the DB user to have DELETE on audit_log for this specific operation.
     */
    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.transaction.annotation.Transactional
    @Query("DELETE FROM AuditLog a WHERE a.timestamp < :cutoff")
    int deleteOlderThan(@Param("cutoff") LocalDateTime cutoff);

    long countByTimestampBefore(LocalDateTime cutoff);
}