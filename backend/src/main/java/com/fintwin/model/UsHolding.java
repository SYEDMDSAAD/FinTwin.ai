package com.fintwin.model;

import com.fintwin.security.EncryptedBigDecimalConverter;
import com.fintwin.security.EncryptedDoubleConverter;
import com.fintwin.security.EncryptionConverter;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * A US-listed holding, priced in USD. Kept apart from {@link Investment}
 * (rupee-valued, counted in net worth) until there is an FX rate to convert it.
 */
@Entity
@Table(name = "us_holding")
public class UsHolding {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Convert(converter = EncryptionConverter.class)
    @Column(name = "name", columnDefinition = "TEXT", nullable = false)
    private String name;

    @Convert(converter = EncryptionConverter.class)
    @Column(name = "ticker", columnDefinition = "TEXT")
    private String ticker;

    @Convert(converter = EncryptedDoubleConverter.class)
    @Column(name = "units", columnDefinition = "TEXT", nullable = false)
    private Double units;

    @Convert(converter = EncryptedBigDecimalConverter.class)
    @Column(name = "buy_price", columnDefinition = "TEXT", nullable = false)
    private BigDecimal buyPrice;

    @Column(name = "buy_date")
    private LocalDate buyDate;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() { createdAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getTicker() { return ticker; }
    public void setTicker(String ticker) { this.ticker = ticker; }
    public Double getUnits() { return units; }
    public void setUnits(Double units) { this.units = units; }
    public BigDecimal getBuyPrice() { return buyPrice; }
    public void setBuyPrice(BigDecimal buyPrice) { this.buyPrice = buyPrice; }
    public LocalDate getBuyDate() { return buyDate; }
    public void setBuyDate(LocalDate buyDate) { this.buyDate = buyDate; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
