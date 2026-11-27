package com.fintwin.model;

import com.fintwin.security.EncryptedDoubleConverter;
import jakarta.persistence.*;

import java.time.LocalDate;

/** One line of a holding's history from a CAS: a purchase, SIP instalment, redemption or dividend. */
@Entity
@Table(name = "holding_transaction")
public class HoldingTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "investment_id", nullable = false)
    private Investment investment;

    @Column(name = "txn_date", nullable = false)
    private LocalDate date;

    @Column(nullable = false, length = 30)
    private String kind;

    /** Into the fund is positive (a purchase), out of it negative (a redemption). */
    @Convert(converter = EncryptedDoubleConverter.class)
    @Column(columnDefinition = "TEXT")
    private Double amount;

    @Convert(converter = EncryptedDoubleConverter.class)
    @Column(columnDefinition = "TEXT")
    private Double units;

    @Convert(converter = EncryptedDoubleConverter.class)
    @Column(columnDefinition = "TEXT")
    private Double nav;

    public HoldingTransaction() {}

    public HoldingTransaction(Investment investment, LocalDate date, String kind, Double amount, Double units, Double nav) {
        this.investment = investment;
        this.date = date;
        this.kind = kind;
        this.amount = amount;
        this.units = units;
        this.nav = nav;
    }

    public Long getId() { return id; }
    public Investment getInvestment() { return investment; }
    public LocalDate getDate() { return date; }
    public String getKind() { return kind; }
    public Double getAmount() { return amount; }
    public Double getUnits() { return units; }
    public Double getNav() { return nav; }
}
