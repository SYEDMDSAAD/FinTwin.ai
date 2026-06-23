package com.fintwin.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(name = "blocked_ips")
public class BlockedIP {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "ip_address", nullable = false, unique = true, length = 45)
    private String ipAddress;

    @Column(name = "reason", length = 500)
    private String reason;

    @Column(name = "blocked_by", length = 200)
    private String blockedBy;

    @CreationTimestamp
    @Column(name = "blocked_at", updatable = false)
    private LocalDateTime blockedAt;

    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    public Long getId()                   { return id; }
    public String getIpAddress()          { return ipAddress; }
    public void setIpAddress(String v)    { this.ipAddress = v; }
    public String getReason()             { return reason; }
    public void setReason(String v)       { this.reason = v; }
    public String getBlockedBy()          { return blockedBy; }
    public void setBlockedBy(String v)    { this.blockedBy = v; }
    public LocalDateTime getBlockedAt()   { return blockedAt; }
    public LocalDateTime getExpiresAt()   { return expiresAt; }
    public void setExpiresAt(LocalDateTime v) { this.expiresAt = v; }
}
