package com.fintwin.model;

import com.fintwin.security.EncryptedBigDecimalConverter;
import com.fintwin.security.EncryptionConverter;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** A recurring mutual-fund debit the user tracks, optionally funding one goal. */
@Entity
@Table(name = "sip_plan")
public class SipPlan {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "goal_id")
    private FinancialGoal goal;

    @Convert(converter = EncryptionConverter.class)
    @Column(name = "fund_name", columnDefinition = "TEXT", nullable = false)
    private String fundName;

    @Convert(converter = EncryptedBigDecimalConverter.class)
    @Column(name = "amount", columnDefinition = "TEXT", nullable = false)
    private BigDecimal amount;

    @Column(name = "frequency", length = 20, nullable = false)
    private String frequency = "Monthly";

    @Column(name = "next_debit_date")
    private LocalDate nextDebitDate;

    @Convert(converter = EncryptionConverter.class)
    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() { createdAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public FinancialGoal getGoal() { return goal; }
    public void setGoal(FinancialGoal goal) { this.goal = goal; }
    public String getFundName() { return fundName; }
    public void setFundName(String fundName) { this.fundName = fundName; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public String getFrequency() { return frequency; }
    public void setFrequency(String frequency) { this.frequency = frequency; }
    public LocalDate getNextDebitDate() { return nextDebitDate; }
    public void setNextDebitDate(LocalDate nextDebitDate) { this.nextDebitDate = nextDebitDate; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
