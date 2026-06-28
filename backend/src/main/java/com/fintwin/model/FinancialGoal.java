package com.fintwin.model;

import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fintwin.security.EncryptedBigDecimalConverter;
import com.fintwin.security.EncryptedDoubleConverter;
import com.fintwin.security.EncryptionConverter;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
public class FinancialGoal {

    @Id
    @GeneratedValue(
        strategy = GenerationType.IDENTITY
    )
    private Long id;

    @Version
    private Long version;

    @Convert(converter = EncryptionConverter.class)
    @Column(length = 400)
    private String title;

    @Convert(converter = EncryptedBigDecimalConverter.class)
    @Column(name = "target_amount", columnDefinition = "TEXT")
    private BigDecimal targetAmount;

    @Convert(converter = EncryptedBigDecimalConverter.class)
    @Column(name = "current_saved", columnDefinition = "TEXT")
    private BigDecimal currentSaved;

    private Integer durationMonths;

    @Convert(converter = EncryptedBigDecimalConverter.class)
    @Column(name = "monthly_target", columnDefinition = "TEXT")
    private BigDecimal monthlyTarget;

    @Convert(converter = EncryptedDoubleConverter.class)
    @Column(name = "success_probability", columnDefinition = "TEXT")
    private Double successProbability;

    // length bumped to 7000 to accommodate AES-256/GCM Base64 overhead on 5000-char plaintext
    @Convert(converter = EncryptionConverter.class)
    @Column(length = 7000)
    private String aiPlan;

    // =========================
    // NEW GOAL TRACKING FIELDS
    // =========================

    @Convert(converter = EncryptedBigDecimalConverter.class)
    @Column(name = "expected_saved", columnDefinition = "TEXT")
    private BigDecimal expectedSaved;

    @Convert(converter = EncryptedDoubleConverter.class)
    @Column(name = "progress_percent", columnDefinition = "TEXT")
    private Double progressPercent;

    @Convert(converter = EncryptedBigDecimalConverter.class)
    @Column(name = "available_savings", columnDefinition = "TEXT")
    private BigDecimal availableSavings;

    private String goalHealth;

    private java.time.LocalDate createdAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    @JsonIgnore
    private User user;

    // =========================
    // GETTERS & SETTERS
    // =========================

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(
        String title
    ) {
        this.title = title;
    }

    // Double compatibility view (estimate/display code + JSON); exact value below.
    public Double getTargetAmount() {
        return targetAmount == null ? null : targetAmount.doubleValue();
    }

    public void setTargetAmount(
        Double targetAmount
    ) {
        this.targetAmount = targetAmount == null ? null : BigDecimal.valueOf(targetAmount);
    }

    public BigDecimal getTargetAmountExact() { return targetAmount; }
    public void setTargetAmountExact(BigDecimal targetAmount) { this.targetAmount = targetAmount; }

    public Double getCurrentSaved() {
        return currentSaved == null ? null : currentSaved.doubleValue();
    }

    public void setCurrentSaved(
        Double currentSaved
    ) {
        this.currentSaved = currentSaved == null ? null : BigDecimal.valueOf(currentSaved);
    }

    public BigDecimal getCurrentSavedExact() { return currentSaved; }
    public void setCurrentSavedExact(BigDecimal currentSaved) { this.currentSaved = currentSaved; }

    public Integer getDurationMonths() {
        return durationMonths;
    }

    public void setDurationMonths(
        Integer durationMonths
    ) {
        this.durationMonths = durationMonths;
    }

    public Double getMonthlyTarget() {
        return monthlyTarget == null ? null : monthlyTarget.doubleValue();
    }

    public void setMonthlyTarget(
        Double monthlyTarget
    ) {
        this.monthlyTarget = monthlyTarget == null ? null : BigDecimal.valueOf(monthlyTarget);
    }

    public BigDecimal getMonthlyTargetExact() { return monthlyTarget; }
    public void setMonthlyTargetExact(BigDecimal monthlyTarget) { this.monthlyTarget = monthlyTarget; }

    public Double getSuccessProbability() {
        return successProbability;
    }

    public void setSuccessProbability(
        Double successProbability
    ) {
        this.successProbability = successProbability;
    }

    public String getAiPlan() {
        return aiPlan;
    }

    public void setAiPlan(
        String aiPlan
    ) {
        this.aiPlan = aiPlan;
    }

    public Double getExpectedSaved() {
        return expectedSaved == null ? null : expectedSaved.doubleValue();
    }

    public void setExpectedSaved(
        Double expectedSaved
    ) {
        this.expectedSaved = expectedSaved == null ? null : BigDecimal.valueOf(expectedSaved);
    }

    public BigDecimal getExpectedSavedExact() { return expectedSaved; }
    public void setExpectedSavedExact(BigDecimal expectedSaved) { this.expectedSaved = expectedSaved; }

    public Double getProgressPercent() {
        return progressPercent;
    }

    public void setProgressPercent(
        Double progressPercent
    ) {
        this.progressPercent = progressPercent;
    }

    public Double getAvailableSavings() {
        return availableSavings == null ? null : availableSavings.doubleValue();
    }

    public void setAvailableSavings(
        Double availableSavings
    ) {
        this.availableSavings = availableSavings == null ? null : BigDecimal.valueOf(availableSavings);
    }

    public BigDecimal getAvailableSavingsExact() { return availableSavings; }
    public void setAvailableSavingsExact(BigDecimal availableSavings) { this.availableSavings = availableSavings; }

    public String getGoalHealth() {
        return goalHealth;
    }

    public void setGoalHealth(
        String goalHealth
    ) {
        this.goalHealth = goalHealth;
    }

    public java.time.LocalDate getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(
        java.time.LocalDate createdAt
    ) {
        this.createdAt = createdAt;
    }

    public User getUser() {
        return user;
    }

    public void setUser(
        User user
    ) {
        this.user = user;
    }
}