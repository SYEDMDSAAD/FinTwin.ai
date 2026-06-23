package com.fintwin.audit;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * PCI-DSS Requirement 10: Audit logging service.
 *
 * Key design decisions:
 *
 * 1. @Async — audit writes happen on a separate thread pool so they
 *    never add latency to the user-facing request. A slow DB write
 *    won't make the API response slow.
 *
 * 2. Propagation.REQUIRES_NEW — audit logs must be committed even
 *    if the calling transaction rolls back. E.g. a failed transaction
 *    save must still produce an audit event. Without REQUIRES_NEW,
 *    the audit log would roll back with the business transaction.
 *
 * 3. SLF4J fallback — if the DB write fails (e.g. DB is down),
 *    the event is written to the application log instead of being
 *    silently lost. Log shipping (ELK, CloudWatch) then captures it.
 *
 * 4. Truncation guards — all string fields are truncated before
 *    insert to prevent data-too-long errors on fixed-length columns.
 */
@Service
public class AuditService {

    private static final Logger log =
            LoggerFactory.getLogger(AuditService.class);

    // Column length limits — must match AuditLog entity @Column(length=...)
    private static final int MAX_ACTION        = 50;
    private static final int MAX_RESOURCE      = 100;
    private static final int MAX_DESCRIPTION   = 500;
    private static final int MAX_IP            = 45;
    private static final int MAX_USER_AGENT    = 512;
    private static final int MAX_HTTP_METHOD   = 10;
    private static final int MAX_URI           = 500;
    private static final int MAX_FAILURE       = 1000;

    @Autowired
    private AuditLogRepository repository;

    // ── Primary log method (full context) ──────────────────────────────────

    /**
     * Log an audit event with full HTTP context.
     * Called by AuditAspect automatically on @Audited methods.
     */
    @Async("auditTaskExecutor")
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void log(
            Long userId,
            String action,
            String resource,
            String description,
            String ipAddress,
            String userAgent,
            String httpMethod,
            String requestUri,
            boolean success,
            String failureReason
    ) {
        try {
            AuditLog entry = new AuditLog();

            entry.setUserId(userId);
            entry.setAction(truncate(action, MAX_ACTION));
            entry.setResource(truncate(resource, MAX_RESOURCE));
            entry.setDescription(truncate(description, MAX_DESCRIPTION));
            entry.setIpAddress(truncate(sanitizeIp(ipAddress), MAX_IP));
            entry.setUserAgent(truncate(userAgent, MAX_USER_AGENT));
            entry.setHttpMethod(truncate(httpMethod, MAX_HTTP_METHOD));
            entry.setRequestUri(truncate(requestUri, MAX_URI));
            entry.setSuccess(success);
            entry.setFailureReason(
                    truncate(failureReason, MAX_FAILURE)
            );
            // timestamp is set by @CreationTimestamp — do not set here

            repository.save(entry);

        } catch (Exception e) {
            // FALLBACK: if DB write fails, write to application log
            // so the event is not silently lost
            log.error(
                "AUDIT_FALLBACK | userId={} action={} resource={} "
                + "success={} reason={} ip={} | DB error: {}",
                userId, action, resource,
                success, failureReason, ipAddress,
                e.getMessage()
            );
        }
    }

    // ── Convenience overload (no description, no HTTP context) ─────────────

    /**
     * Simplified log for manual calls from service layer
     * where HTTP context is not available.
     */
    @Async("auditTaskExecutor")
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void log(
            Long userId,
            String action,
            String resource,
            String ipAddress,
            String userAgent,
            boolean success,
            String failureReason
    ) {
        log(
            userId,
            action,
            resource,
            null,       // no description
            ipAddress,
            userAgent,
            null,       // no httpMethod
            null,       // no requestUri
            success,
            failureReason
        );
    }

    // ── Security event shortcuts ────────────────────────────────────────────

    /**
     * Log a login attempt. Call from AuthService on every login,
     * both successful and failed.
     */
    @Async("auditTaskExecutor")
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logLogin(
            Long userId,
            String ipAddress,
            String userAgent,
            boolean success,
            String failureReason
    ) {
        log(
            userId,
            "LOGIN",
            "auth",
            success ? "Successful login" : "Failed login attempt",
            ipAddress,
            userAgent,
            "POST",
            "/api/auth/login",
            success,
            failureReason
        );
    }

    /**
     * Log an account deletion — PCI-DSS requires explicit audit
     * of all data destruction events.
     */
    @Async("auditTaskExecutor")
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logAccountDeletion(Long userId, String ipAddress) {
        log(
            userId,
            "DELETE",
            "account",
            "User account and all associated data permanently deleted",
            ipAddress,
            null,
            "DELETE",
            "/api/profile/delete",
            true,
            null
        );
    }

    /**
     * Log a password change.
     */
    @Async("auditTaskExecutor")
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logPasswordChange(Long userId, String ipAddress) {
        log(
            userId,
            "WRITE",
            "auth",
            "Password changed successfully",
            ipAddress,
            null,
            "PUT",
            "/api/profile/change-password",
            true,
            null
        );
    }

    // ── Private helpers ─────────────────────────────────────────────────────

    /**
     * Truncate a string to maxLen characters.
     * Prevents data-too-long DB errors on fixed-length columns.
     */
    private String truncate(String value, int maxLen) {
        if (value == null) return null;
        return value.length() <= maxLen
                ? value
                : value.substring(0, maxLen);
    }

    /**
     * Basic IP sanitization — strips any characters that aren't
     * valid in IPv4 or IPv6 addresses to prevent log injection.
     */
    private String sanitizeIp(String ip) {
        if (ip == null) return null;
        // Allow digits, dots, colons (IPv6), and brackets
        return ip.replaceAll("[^0-9a-fA-F.:\\[\\]]", "");
    }
}