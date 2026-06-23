package com.fintwin.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fintwin.security.EncryptionConverter;
import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "crypto_connections")
public class CryptoConnection {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    @JsonIgnore
    private User user;

    // Exchange name: "Binance", "WazirX", "CoinDCX", etc.
    private String exchange;

    // Encrypted API credentials — never returned to frontend
    @JsonIgnore
    @Convert(converter = EncryptionConverter.class)
    @Column(name = "api_key", length = 512)
    private String apiKey;

    @JsonIgnore
    @Convert(converter = EncryptionConverter.class)
    @Column(name = "api_secret", length = 512)
    private String apiSecret;

    private LocalDateTime createdAt;
    private LocalDateTime lastSyncedAt;
    private String        syncStatus;

    public CryptoConnection() {
        this.createdAt = LocalDateTime.now();
        this.syncStatus = "PENDING";
    }

    public Long getId()                    { return id; }
    public User getUser()                  { return user; }
    public void setUser(User user)         { this.user = user; }
    public String getExchange()            { return exchange; }
    public void setExchange(String e)      { this.exchange = e; }
    public String getApiKey()              { return apiKey; }
    public void setApiKey(String k)        { this.apiKey = k; }
    public String getApiSecret()           { return apiSecret; }
    public void setApiSecret(String s)     { this.apiSecret = s; }
    public LocalDateTime getCreatedAt()    { return createdAt; }
    public LocalDateTime getLastSyncedAt() { return lastSyncedAt; }
    public void setLastSyncedAt(LocalDateTime t) { this.lastSyncedAt = t; }
    public String getSyncStatus()          { return syncStatus; }
    public void setSyncStatus(String s)    { this.syncStatus = s; }
}
