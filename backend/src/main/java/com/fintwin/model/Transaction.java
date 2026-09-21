package com.fintwin.model;

import jakarta.persistence.*;
import lombok.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fintwin.security.EncryptedBigDecimalConverter;
import com.fintwin.security.EncryptionConverter;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(indexes = {
    @Index(name = "idx_txn_user_date",     columnList = "user_id, date"),
    @Index(name = "idx_txn_user_ext_id",   columnList = "user_id, external_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Transaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Version
    private Long version;

    // Proper DATE column — ingest points normalize external strings via
    // DateNormalizer so regional formats can never reach the database.
    private LocalDate date;

    @Convert(converter = EncryptionConverter.class)
    @Column(length = 400)
    private String merchant;

    @Convert(converter = EncryptedBigDecimalConverter.class)
    @Column(columnDefinition = "TEXT")
    private BigDecimal amount;

    @Convert(converter = EncryptionConverter.class)
    @Column(length = 400)
    private String category;

    // "MANUAL", "BANK" (AA sync), "CARD" (AA card sync, card statement or card
    // alert email), "STATEMENT" (uploaded bank statement), "EMAIL" (bank-account
    // alert email) — null treated as MANUAL for legacy rows
    private String source;

    // Dedupe key: Setu txnId ("CARD:" prefix for cards), a statement-row hash
    // ("STMT:"), or an alert email's Message-ID hash ("MAIL:")
    @Column(name = "external_id")
    private String externalId;

    // The account as the user knows it, e.g. "HDFC ··1234" — masked, so stored
    // plain. Drives per-account coverage; null for manual and legacy rows.
    @Column(name = "account_ref", length = 64)
    private String accountRef;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    @JsonIgnore
    private User user;

    // Double compatibility view (estimate/display code + JSON); these manual
    // accessors also suppress Lombok generating a clashing BigDecimal getAmount().
    public Double getAmount() {
        return amount == null ? null : amount.doubleValue();
    }

    public void setAmount(Double amount) {
        this.amount = amount == null ? null : BigDecimal.valueOf(amount);
    }

    public BigDecimal getAmountExact() {
        return amount;
    }

    public void setAmountExact(BigDecimal amount) {
        this.amount = amount;
    }
}