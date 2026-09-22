package com.fintwin.model;

import jakarta.persistence.*;
import lombok.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fintwin.security.EncryptedBigDecimalConverter;
import com.fintwin.security.EncryptionConverter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

import com.fintwin.util.Categorized;

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

    // A pooled sequence, not IDENTITY: with IDENTITY Hibernate must run each
    // INSERT alone to learn its id, which silently disables JDBC batching. A
    // 300-row statement then cost 300 round trips (~50 s to a remote DB);
    // pooled ids let inserts go 50 per batch. Matches V18's INCREMENT BY 50.
    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "transaction_id_seq")
    @SequenceGenerator(name = "transaction_id_seq", sequenceName = "transaction_id_seq", allocationSize = 50)
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

    // ── How the category was arrived at (labels for measuring and, later,
    // training categorisation). predictedCategory is what FinTwin chose on its
    // own; category is what the transaction has now. When a user corrects it,
    // category changes and predictedCategory stays — the pair is the label.
    @Convert(converter = EncryptionConverter.class)
    @Column(name = "predicted_category", length = 400)
    private String predictedCategory;

    // A Categorized source: BRAND, SHOP_WORD, PERSON, LEARNED, NONE, USER, …
    @Column(name = "category_source", length = 20)
    private String categorySource;

    // CORRECTED / CONFIRMED / APPLIED once the user has acted on it, else null
    @Column(name = "category_review", length = 12)
    private String categoryReview;

    @Column(name = "category_reviewed_at")
    private LocalDateTime categoryReviewedAt;

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

    /** Take FinTwin's own category for this transaction, recording how it was chosen. */
    public void applyPrediction(Categorized c) {
        this.category = c.category();
        this.predictedCategory = c.category();
        this.categorySource = c.source();
    }

    /** A category the user picked themselves — not a prediction. */
    public void applyUserCategory(String category) {
        this.category = category;
        this.predictedCategory = null;
        this.categorySource = Categorized.USER;
    }

    /**
     * The user set this transaction's category to {@code chosen}: record it
     * against what FinTwin had predicted. {@code bulk} = set via "apply to
     * similar", so the user didn't look at this row itself.
     */
    public void recordReview(String chosen, boolean bulk) {
        if (categorySource == null) {
            // Categorised before sources were recorded: what it showed was the prediction
            this.predictedCategory = this.category;
            this.categorySource = Categorized.LEGACY;
        }
        this.category = chosen;
        if (Categorized.USER.equals(categorySource) || Categorized.SEED.equals(categorySource)) {
            this.categoryReview = Categorized.CORRECTED;   // no prediction to compare with
        } else if (bulk) {
            this.categoryReview = Categorized.APPLIED;
        } else {
            this.categoryReview = chosen.equalsIgnoreCase(String.valueOf(predictedCategory))
                    ? Categorized.CONFIRMED : Categorized.CORRECTED;
        }
        this.categoryReviewedAt = LocalDateTime.now();
    }
}
