package com.fintwin.model;

import com.fintwin.security.EncryptionConverter;
import jakarta.persistence.*;
import java.time.LocalDateTime;

/** Something one of FinTwin's agents did or noticed, shown in the bell. */
@Entity
@Table(name = "agent_alert")
public class AgentAlert {

    public static final String SORT = "SORT";
    public static final String WATCH = "WATCH";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "agent", length = 10, nullable = false)
    private String agent;

    @Column(name = "pattern_key", length = 64, nullable = false)
    private String patternKey;

    @Column(name = "severity", length = 10)
    private String severity;

    @Column(name = "anomaly_type", length = 40)
    private String anomalyType;

    @Convert(converter = EncryptionConverter.class)
    @Column(name = "merchant", columnDefinition = "TEXT")
    private String merchant;

    @Convert(converter = EncryptionConverter.class)
    @Column(name = "message", columnDefinition = "TEXT", nullable = false)
    private String message;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() { if (createdAt == null) createdAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public String getAgent() { return agent; }
    public void setAgent(String agent) { this.agent = agent; }
    public String getPatternKey() { return patternKey; }
    public void setPatternKey(String patternKey) { this.patternKey = patternKey; }
    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }
    public String getAnomalyType() { return anomalyType; }
    public void setAnomalyType(String anomalyType) { this.anomalyType = anomalyType; }
    public String getMerchant() { return merchant; }
    public void setMerchant(String merchant) { this.merchant = merchant; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
