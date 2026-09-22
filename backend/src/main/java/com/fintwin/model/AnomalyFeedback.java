package com.fintwin.model;

import com.fintwin.security.EncryptedBigDecimalConverter;
import com.fintwin.security.EncryptionConverter;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** A user's verdict on one anomaly alert, with what made it look unusual. */
@Entity
@Table(name = "anomaly_feedback")
@Getter
@Setter
@NoArgsConstructor
public class AnomalyFeedback {

    public static final String CONFIRMED = "CONFIRMED";
    public static final String NOT_ANOMALY = "NOT_ANOMALY";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(name = "pattern_key", length = 64)
    private String patternKey;

    @Column(length = 12)
    private String verdict;

    @Column(name = "anomaly_type", length = 40)
    private String anomalyType;

    @Convert(converter = EncryptionConverter.class)
    @Column(columnDefinition = "TEXT")
    private String merchant;

    @Column(length = 100)
    private String category;

    @Convert(converter = EncryptedBigDecimalConverter.class)
    @Column(columnDefinition = "TEXT")
    private BigDecimal amount;

    @Convert(converter = EncryptedBigDecimalConverter.class)
    @Column(name = "avg_amount", columnDefinition = "TEXT")
    private BigDecimal avgAmount;

    private Double multiplier;

    @Column(length = 10)
    private String severity;

    @Column(name = "created_at")
    private LocalDateTime createdAt;
}
