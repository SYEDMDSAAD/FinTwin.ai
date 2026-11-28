package com.fintwin.model;

import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fintwin.security.EncryptedBigDecimalConverter;
import com.fintwin.security.EncryptedDoubleConverter;
import com.fintwin.security.EncryptionConverter;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "investments")
public class Investment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Version
    private Long version;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    @JsonIgnore
    private User user;

    @Convert(converter = EncryptionConverter.class)
    @Column(length = 512)
    private String name;

    // Stocks | Mutual Fund | Fixed Deposit | Gold | PPF | NPS | Bonds | Crypto | Real Estate | Other
    private String type;

    @Convert(converter = EncryptedBigDecimalConverter.class)
    @Column(name = "invested_amount", columnDefinition = "TEXT")
    private BigDecimal investedAmount;

    @Convert(converter = EncryptedBigDecimalConverter.class)
    @Column(name = "current_value", columnDefinition = "TEXT")
    private BigDecimal currentValue;

    private LocalDate purchaseDate;

    // For MF: AMFI scheme code. For stocks: NSE ticker (e.g. "TCS.NS").
    // For gold: null (uses system gold price). For FD/PPF/NPS/Bonds: null.
    @Convert(converter = EncryptionConverter.class)
    @Column(length = 512)
    private String tickerCode;

    // Units held: MF units, stock shares, gold grams, crypto coins
    @Convert(converter = EncryptedDoubleConverter.class)
    @Column(columnDefinition = "TEXT")
    private Double units;

    // Annual interest rate % — for Fixed Deposit, Bonds (user-defined).
    // PPF defaults to 7.1%, NPS to 9% when null.
    @Convert(converter = EncryptedDoubleConverter.class)
    @Column(name = "interest_rate", columnDefinition = "TEXT")
    private Double interestRate;

    @Convert(converter = EncryptionConverter.class)
    @Column(length = 1400)
    private String notes;

    // IPO holdings only: APPLIED → ALLOTTED | NOT_ALLOTTED → LISTED
    @Column(name = "ipo_status", length = 20)
    private String ipoStatus;

    // IPO holdings only: the catalog entry this application is for, if any
    @Column(name = "ipo_listing_id")
    private Long ipoListingId;

    // CAS imports only: the fund or share's ISIN and the folio's last 4 digits,
    // which together tell one holding from another on the next statement.
    @Convert(converter = EncryptionConverter.class)
    @Column(length = 512)
    private String isin;

    @Convert(converter = EncryptionConverter.class)
    @Column(name = "folio_tail", length = 512)
    private String folioTail;

    /** CAMS | KFINTECH | NSDL | CDSL when imported from a statement; null when added by hand. */
    @Column(length = 20)
    private String source;

    /** The statement date the units are from. */
    @Column(name = "units_as_of")
    private LocalDate unitsAsOf;

    /** EQUITY, DEBT, HYBRID… as the statement classifies the fund; decides how gains are taxed. */
    @Column(name = "asset_class", length = 20)
    private String assetClass;

    // getters & setters

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    // Double compatibility view (estimate/display code + JSON); exact value below.
    public Double getInvestedAmount() { return investedAmount == null ? null : investedAmount.doubleValue(); }
    public void setInvestedAmount(Double investedAmount) { this.investedAmount = investedAmount == null ? null : BigDecimal.valueOf(investedAmount); }
    public BigDecimal getInvestedAmountExact() { return investedAmount; }
    public void setInvestedAmountExact(BigDecimal investedAmount) { this.investedAmount = investedAmount; }

    public Double getCurrentValue() { return currentValue == null ? null : currentValue.doubleValue(); }
    public void setCurrentValue(Double currentValue) { this.currentValue = currentValue == null ? null : BigDecimal.valueOf(currentValue); }
    public BigDecimal getCurrentValueExact() { return currentValue; }
    public void setCurrentValueExact(BigDecimal currentValue) { this.currentValue = currentValue; }

    public LocalDate getPurchaseDate() { return purchaseDate; }
    public void setPurchaseDate(LocalDate purchaseDate) { this.purchaseDate = purchaseDate; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public String getTickerCode() { return tickerCode; }
    public String getIpoStatus() { return ipoStatus; }
    public void setIpoStatus(String ipoStatus) { this.ipoStatus = ipoStatus; }
    public Long getIpoListingId() { return ipoListingId; }
    public void setIpoListingId(Long ipoListingId) { this.ipoListingId = ipoListingId; }
    public void setTickerCode(String tickerCode) { this.tickerCode = tickerCode; }

    public Double getUnits() { return units; }
    public void setUnits(Double units) { this.units = units; }

    public Double getInterestRate() { return interestRate; }
    public void setInterestRate(Double interestRate) { this.interestRate = interestRate; }

    public String getIsin() { return isin; }
    public void setIsin(String isin) { this.isin = isin; }
    public String getFolioTail() { return folioTail; }
    public void setFolioTail(String folioTail) { this.folioTail = folioTail; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public LocalDate getUnitsAsOf() { return unitsAsOf; }
    public String getAssetClass() { return assetClass; }
    public void setAssetClass(String assetClass) { this.assetClass = assetClass; }
    public void setUnitsAsOf(LocalDate unitsAsOf) { this.unitsAsOf = unitsAsOf; }
}
