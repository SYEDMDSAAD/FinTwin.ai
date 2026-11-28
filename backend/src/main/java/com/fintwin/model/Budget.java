package com.fintwin.model;

import jakarta.persistence.*;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fintwin.security.EncryptedBigDecimalConverter;

import java.math.BigDecimal;

@Entity

public class Budget {

    @Id

    @GeneratedValue(strategy = GenerationType.IDENTITY)

    private Long id;

    @Version
    private Long version;

    private String category;

    @Convert(converter = EncryptedBigDecimalConverter.class)
    @Column(name = "limit_amount", columnDefinition = "TEXT")
    private BigDecimal limitAmount;

    /** First day this budget counts; null = from the start. */
    @Column(name = "starts_on")
    private java.time.LocalDate startsOn;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    @JsonIgnore
    private User user;

    // =========================
    // Getters & Setters
    // =========================

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    // Double compatibility view (estimate/display code + JSON); exact value below.
    public Double getLimitAmount() {
        return limitAmount == null ? null : limitAmount.doubleValue();
    }

    public void setLimitAmount(Double limitAmount) {
        this.limitAmount = limitAmount == null ? null : BigDecimal.valueOf(limitAmount);
    }

    public BigDecimal getLimitAmountExact() {
        return limitAmount;
    }

    public void setLimitAmountExact(BigDecimal limitAmount) {
        this.limitAmount = limitAmount;
    }

    public java.time.LocalDate getStartsOn() {
        return startsOn;
    }

    public void setStartsOn(java.time.LocalDate startsOn) {
        this.startsOn = startsOn;
    }

    /** False for a month before the budget starts. */
    public boolean countsIn(java.time.YearMonth month) {
        return startsOn == null || !java.time.YearMonth.from(startsOn).isAfter(month);
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }
}