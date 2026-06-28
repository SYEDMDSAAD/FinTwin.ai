package com.fintwin.model;

import jakarta.persistence.*;
import lombok.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fintwin.security.EncryptedBigDecimalConverter;
import com.fintwin.security.EncryptionConverter;

import java.math.BigDecimal;

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

    private String date;

    @Convert(converter = EncryptionConverter.class)
    @Column(length = 400)
    private String merchant;

    @Convert(converter = EncryptedBigDecimalConverter.class)
    @Column(columnDefinition = "TEXT")
    private BigDecimal amount;

    @Convert(converter = EncryptionConverter.class)
    @Column(length = 400)
    private String category;

    // "MANUAL" or "BANK" — null treated as MANUAL for legacy rows
    private String source;

    // Setu txnId — used for deduplication on re-sync
    @Column(name = "external_id")
    private String externalId;

    @ManyToOne
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