package com.fintwin.model;

import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fintwin.security.EncryptedBigDecimalConverter;
import com.fintwin.security.EncryptedDoubleConverter;
import com.fintwin.security.EncryptionConverter;

import java.math.BigDecimal;

@Entity
public class Liability {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Version
    private Long version;

    @Convert(converter = EncryptionConverter.class)
    @Column(length = 400)
    private String name;

    @Convert(converter = EncryptedBigDecimalConverter.class)
    @Column(columnDefinition = "TEXT")
    private BigDecimal amount;

    private String type;

    // Annual interest rate % on this debt (optional, user-supplied)
    @Convert(converter = EncryptedDoubleConverter.class)
    @Column(name = "interest_rate", columnDefinition = "TEXT")
    private Double interestRate;

    // Monthly payment (EMI). Enables real payment-based debt-to-income
    // instead of a balance-vs-annual-income leverage proxy.
    @Convert(converter = EncryptedDoubleConverter.class)
    @Column(columnDefinition = "TEXT")
    private Double emi;

    // Remaining term in months (optional)
    @Column(name = "term_months")
    private Integer termMonths;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    @JsonIgnore
    private User user;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    // Double compatibility view (estimate/display code + JSON); exact value below.
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

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public Double getInterestRate() { return interestRate; }
    public void setInterestRate(Double interestRate) { this.interestRate = interestRate; }

    public Double getEmi() { return emi; }
    public void setEmi(Double emi) { this.emi = emi; }

    public Integer getTermMonths() { return termMonths; }
    public void setTermMonths(Integer termMonths) { this.termMonths = termMonths; }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }
}