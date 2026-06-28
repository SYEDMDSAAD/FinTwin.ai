package com.fintwin.model;

import jakarta.persistence.*;
import lombok.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fintwin.security.EncryptedDoubleConverter;
import com.fintwin.security.EncryptionConverter;

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

    private String date;

    @Convert(converter = EncryptionConverter.class)
    @Column(length = 400)
    private String merchant;

    @Convert(converter = EncryptedDoubleConverter.class)
    @Column(columnDefinition = "TEXT")
    private Double amount;

    @Convert(converter = EncryptionConverter.class)
    @Column(length = 400)
    private String category;

    // "MANUAL" or "BANK" — null treated as MANUAL for legacy rows
    private String source;

    // Setu txnId — used for deduplication on re-sync
    @Column(name = "external_id")
    private String externalId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    @JsonIgnore
    private User user;
}