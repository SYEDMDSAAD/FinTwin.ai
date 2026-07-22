package com.fintwin.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * A per-user learned categorization rule. Created/updated whenever the user
 * manually recategorizes a transaction; consulted before the global keyword
 * rules so the user's own corrections always win.
 */
@Entity
@Table(name = "user_merchant_category",
       uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "merchant_pattern"}))
public class UserMerchantCategory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // Normalized merchant string (lowercase, trimmed, collapsed whitespace)
    @Column(name = "merchant_pattern", length = 400, nullable = false)
    private String merchantPattern;

    @Column(name = "category", length = 100, nullable = false)
    private String category;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public String getMerchantPattern() { return merchantPattern; }
    public void setMerchantPattern(String merchantPattern) { this.merchantPattern = merchantPattern; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
