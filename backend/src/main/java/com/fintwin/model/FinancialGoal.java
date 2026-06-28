package com.fintwin.model;

import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fintwin.security.EncryptedDoubleConverter;
import com.fintwin.security.EncryptionConverter;

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

    @Convert(converter = EncryptedDoubleConverter.class)
    @Column(name = "target_amount", columnDefinition = "TEXT")
    private Double targetAmount;

    @Convert(converter = EncryptedDoubleConverter.class)
    @Column(name = "current_saved", columnDefinition = "TEXT")
    private Double currentSaved;

    private Integer durationMonths;

    @Convert(converter = EncryptedDoubleConverter.class)
    @Column(name = "monthly_target", columnDefinition = "TEXT")
    private Double monthlyTarget;

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

    @Convert(converter = EncryptedDoubleConverter.class)
    @Column(name = "expected_saved", columnDefinition = "TEXT")
    private Double expectedSaved;

    @Convert(converter = EncryptedDoubleConverter.class)
    @Column(name = "progress_percent", columnDefinition = "TEXT")
    private Double progressPercent;

    @Convert(converter = EncryptedDoubleConverter.class)
    @Column(name = "available_savings", columnDefinition = "TEXT")
    private Double availableSavings;

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

    public Double getTargetAmount() {
        return targetAmount;
    }

    public void setTargetAmount(
        Double targetAmount
    ) {
        this.targetAmount = targetAmount;
    }

    public Double getCurrentSaved() {
        return currentSaved;
    }

    public void setCurrentSaved(
        Double currentSaved
    ) {
        this.currentSaved = currentSaved;
    }

    public Integer getDurationMonths() {
        return durationMonths;
    }

    public void setDurationMonths(
        Integer durationMonths
    ) {
        this.durationMonths = durationMonths;
    }

    public Double getMonthlyTarget() {
        return monthlyTarget;
    }

    public void setMonthlyTarget(
        Double monthlyTarget
    ) {
        this.monthlyTarget = monthlyTarget;
    }

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
        return expectedSaved;
    }

    public void setExpectedSaved(
        Double expectedSaved
    ) {
        this.expectedSaved = expectedSaved;
    }

    public Double getProgressPercent() {
        return progressPercent;
    }

    public void setProgressPercent(
        Double progressPercent
    ) {
        this.progressPercent = progressPercent;
    }

    public Double getAvailableSavings() {
        return availableSavings;
    }

    public void setAvailableSavings(
        Double availableSavings
    ) {
        this.availableSavings = availableSavings;
    }

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