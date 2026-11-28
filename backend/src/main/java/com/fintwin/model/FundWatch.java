package com.fintwin.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/** A mutual fund on the user's watchlist (public AMFI scheme code and name). */
@Entity
@Table(name = "fund_watch")
public class FundWatch {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "scheme_code", length = 20, nullable = false)
    private String schemeCode;

    @Column(name = "scheme_name", length = 300, nullable = false)
    private String schemeName;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() { createdAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public String getSchemeCode() { return schemeCode; }
    public void setSchemeCode(String schemeCode) { this.schemeCode = schemeCode; }
    public String getSchemeName() { return schemeName; }
    public void setSchemeName(String schemeName) { this.schemeName = schemeName; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
