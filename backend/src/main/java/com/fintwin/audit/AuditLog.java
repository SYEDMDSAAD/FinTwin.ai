package com.fintwin.audit;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * PCI-DSS Requirement 10: Immutable audit log entry.
 *
 * Rules:
 * - Records are INSERT-only. No UPDATE or DELETE must ever be issued
 *   against this table by the application DB user.
 * - Indexed for fast compliance queries by userId, timestamp, action.
 * - All columns that are set at creation are marked updatable=false.
 */
@Entity
@Table(
    name = "audit_log",
    indexes = {
        // PCI-DSS 10.2: query by user for individual accountability
        @Index(name = "idx_audit_user_id",   columnList = "userId"),
        // PCI-DSS 10.7: query by time for retention + incident response
        @Index(name = "idx_audit_timestamp", columnList = "timestamp"),
        // Filter by action type (LOGIN, READ, WRITE, DELETE)
        @Index(name = "idx_audit_action",    columnList = "action"),
        // Compound index for the most common compliance query pattern
        @Index(name = "idx_audit_user_time", columnList = "userId, timestamp")
    }
)
public class AuditLog {

    // SEQUENCE (not IDENTITY): partitioned tables in PostgreSQL do not support IDENTITY columns.
    // allocationSize=50 matches INCREMENT 50 in V3 migration's CREATE SEQUENCE.
    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "audit_log_id_seq")
    @SequenceGenerator(name = "audit_log_id_seq", sequenceName = "audit_log_id_seq", allocationSize = 50)
    private Long id;

    // ── Who ────────────────────────────────────────────────────
    // Nullable: some events (failed login attempts) have no userId yet
    @Column(name = "user_id", updatable = false)
    private Long userId;

    // ── What ───────────────────────────────────────────────────
    @Column(
        name = "action",
        nullable = false,
        length = 50,
        updatable = false
    )
    private String action; // READ, WRITE, DELETE, LOGIN, LOGOUT, EXPORT

    @Column(
        name = "resource",
        nullable = false,
        length = 100,
        updatable = false
    )
    private String resource; // transactions, budgets, profile, goals

    @Column(
        name = "description",
        length = 500,
        updatable = false
    )
    private String description; // optional human-readable context

    // ── Where / How ────────────────────────────────────────────
    @Column(
        name = "ip_address",
        length = 45,   // IPv6 max = 39 chars; 45 covers edge cases
        updatable = false
    )
    private String ipAddress;

    @Column(
        name = "user_agent",
        length = 512,  // FIXED: was 1000 but most UAs are <300 chars
        updatable = false
    )
    private String userAgent;

    @Column(
        name = "http_method",
        length = 10,
        updatable = false
    )
    private String httpMethod; // GET, POST, PUT, DELETE

    @Column(
        name = "request_uri",
        length = 500,
        updatable = false
    )
    private String requestUri;

    // ── When ───────────────────────────────────────────────────
    // FIXED: was set in application code — DB server time is authoritative
    @CreationTimestamp
    @Column(
        name = "timestamp",
        nullable = false,
        updatable = false
    )
    private LocalDateTime timestamp;

    // ── Result ─────────────────────────────────────────────────
    @Column(
        name = "success",
        nullable = false,
        updatable = false
    )
    private boolean success;

    @Column(
        name = "failure_reason",
        length = 1000, // FIXED: was 2000; truncated anyway — 1000 is sufficient
        updatable = false
    )
    private String failureReason;

    // ── Getters (no setters for id/timestamp — immutable) ──────

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public String getResource() {
        return resource;
    }

    public void setResource(String resource) {
        this.resource = resource;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getIpAddress() {
        return ipAddress;
    }

    public void setIpAddress(String ipAddress) {
        this.ipAddress = ipAddress;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public void setUserAgent(String userAgent) {
        this.userAgent = userAgent;
    }

    public String getHttpMethod() {
        return httpMethod;
    }

    public void setHttpMethod(String httpMethod) {
        this.httpMethod = httpMethod;
    }

    public String getRequestUri() {
        return requestUri;
    }

    public void setRequestUri(String requestUri) {
        this.requestUri = requestUri;
    }

    public LocalDateTime getTimestamp() {
        return timestamp;
    }

    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public String getFailureReason() {
        return failureReason;
    }

    public void setFailureReason(String failureReason) {
        this.failureReason = failureReason;
    }
}