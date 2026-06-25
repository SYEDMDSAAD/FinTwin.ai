package com.fintwin.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "dismissed_anomaly_pattern",
       uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "anomaly_type", "merchant"}))
public class DismissedAnomalyPattern {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "anomaly_type", length = 50)
    private String anomalyType;

    @Column(name = "merchant", length = 400)
    private String merchant;

    @Column(name = "category", length = 255)
    private String category;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() { createdAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public String getAnomalyType() { return anomalyType; }
    public void setAnomalyType(String anomalyType) { this.anomalyType = anomalyType; }
    public String getMerchant() { return merchant; }
    public void setMerchant(String merchant) { this.merchant = merchant; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
