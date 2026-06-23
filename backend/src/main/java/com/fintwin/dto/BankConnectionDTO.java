package com.fintwin.dto;

import com.fintwin.model.BankConnection;

import java.time.LocalDateTime;

public class BankConnectionDTO {

    private Long id;
    private String bankName;
    private String maskedAccountNumber;
    private String consentStatus;
    private LocalDateTime createdAt;
    private LocalDateTime lastSyncedAt;

    public BankConnectionDTO(BankConnection c) {
        this.id                  = c.getId();
        this.bankName            = c.getBankName();
        this.maskedAccountNumber = c.getMaskedAccountNumber();
        this.consentStatus       = c.getConsentStatus();
        this.createdAt           = c.getCreatedAt();
        this.lastSyncedAt        = c.getLastSyncedAt();
    }

    public Long getId()                           { return id; }
    public String getBankName()                   { return bankName; }
    public String getMaskedAccountNumber()        { return maskedAccountNumber; }
    public String getConsentStatus()              { return consentStatus; }
    public LocalDateTime getCreatedAt()           { return createdAt; }
    public LocalDateTime getLastSyncedAt()        { return lastSyncedAt; }
}
