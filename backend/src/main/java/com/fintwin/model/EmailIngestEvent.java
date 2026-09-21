package com.fintwin.model;

import jakarta.persistence.*;

import java.time.LocalDateTime;

/**
 * What happened to one email forwarded to a user's alert address. Holds no
 * subject or body — only enough to show the user their recent alerts and to
 * notice when a bank rewords its alerts and they stop matching.
 */
@Entity
@Table(name = "email_ingest_event")
public class EmailIngestEvent {

    public enum Status { IMPORTED, DUPLICATE, UNMATCHED, REJECTED, CONFIRMATION }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(name = "received_at", nullable = false)
    private LocalDateTime receivedAt;

    @Column(name = "sender_domain")
    private String senderDomain;

    @Column(length = 64)
    private String bank;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    private String detail;

    @Column(name = "account_ref", length = 64)
    private String accountRef;

    @Column(name = "transaction_id")
    private Long transactionId;

    protected EmailIngestEvent() {}

    public EmailIngestEvent(User user, LocalDateTime receivedAt, String senderDomain, String bank,
                            Status status, String detail, String accountRef, Long transactionId) {
        this.user = user;
        this.receivedAt = receivedAt;
        this.senderDomain = senderDomain;
        this.bank = bank;
        this.status = status;
        this.detail = detail == null || detail.length() <= 255 ? detail : detail.substring(0, 255);
        this.accountRef = accountRef;
        this.transactionId = transactionId;
    }

    public Long getId() { return id; }
    public User getUser() { return user; }
    public LocalDateTime getReceivedAt() { return receivedAt; }
    public String getSenderDomain() { return senderDomain; }
    public String getBank() { return bank; }
    public Status getStatus() { return status; }
    public String getDetail() { return detail; }
    public String getAccountRef() { return accountRef; }
    public Long getTransactionId() { return transactionId; }
}
