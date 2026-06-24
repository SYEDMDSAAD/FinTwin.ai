package com.fintwin.model;

import jakarta.persistence.*;
import lombok.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fintwin.security.EncryptionConverter;

import java.time.LocalDateTime;

@Entity
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class BankConnection {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "user_id")
    @JsonIgnore
    private User user;

    // Returned immediately by Setu on consent creation
    @JsonIgnore
    @Convert(converter = EncryptionConverter.class)
    @Column(name = "consent_handle", length = 512)
    private String consentHandle;

    // Set by webhook after user approves consent — encrypted because a leaked
    // consentId could be used to make Setu FI data requests on behalf of the user
    @JsonIgnore
    @Convert(converter = EncryptionConverter.class)
    @Column(name = "consent_id", length = 512)
    private String consentId;

    // PENDING → ACTIVE → REVOKED / EXPIRED / PAUSED
    @Column(name = "consent_status")
    private String consentStatus;

    // Populated after FI data is first fetched
    @Convert(converter = EncryptionConverter.class)
    @Column(name = "masked_account_number", length = 512)
    private String maskedAccountNumber;

    @Convert(converter = EncryptionConverter.class)
    @Column(name = "bank_name", length = 512)
    private String bankName;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "last_synced_at")
    private LocalDateTime lastSyncedAt;

    // Tracks the last Setu session that was fully processed — prevents duplicate
    // transactions when Setu retries SESSION_STATUS_UPDATE webhooks
    @Column(name = "last_processed_session_id")
    private String lastProcessedSessionId;
}
