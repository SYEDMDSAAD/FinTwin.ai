package com.fintwin.model;

import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fintwin.security.EncryptedBigDecimalConverter;
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

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }
}