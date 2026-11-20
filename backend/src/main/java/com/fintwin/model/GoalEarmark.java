package com.fintwin.model;

import com.fintwin.security.EncryptedBigDecimalConverter;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Money an approved Spend Guard salary plan set aside for a goal in one month.
 * Goal progress gives that month's real savings to earmarked goals first
 * ({@link com.fintwin.util.GoalMath#allocateSavings}).
 */
@Entity
@Table(name = "goal_earmark")
@Getter
@Setter
@NoArgsConstructor
public class GoalEarmark {

    public static final String SPEND_GUARD = "SPEND_GUARD";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "goal_id", nullable = false)
    private FinancialGoal goal;

    /** "2026-11" */
    @Column(length = 7, nullable = false)
    private String month;

    @Convert(converter = EncryptedBigDecimalConverter.class)
    @Column(columnDefinition = "TEXT", nullable = false)
    private BigDecimal amount;

    @Column(length = 20, nullable = false)
    private String source;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
