package com.fintwin.dto;

import com.fintwin.model.CryptoConnection;

import java.time.LocalDateTime;

public class CryptoConnectionDTO {
    private Long          id;
    private String        exchange;
    private String        syncStatus;
    private LocalDateTime createdAt;
    private LocalDateTime lastSyncedAt;

    public CryptoConnectionDTO(CryptoConnection c) {
        this.id           = c.getId();
        this.exchange     = c.getExchange();
        this.syncStatus   = c.getSyncStatus();
        this.createdAt    = c.getCreatedAt();
        this.lastSyncedAt = c.getLastSyncedAt();
        // apiKey and apiSecret are NOT included — @JsonIgnore on model + not mapped here
    }

    public Long getId()                    { return id; }
    public String getExchange()            { return exchange; }
    public String getSyncStatus()          { return syncStatus; }
    public LocalDateTime getCreatedAt()    { return createdAt; }
    public LocalDateTime getLastSyncedAt() { return lastSyncedAt; }
}
