package com.fintwin.model;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** An IPO in the admin-maintained catalog shown on the Discover page. */
@Entity
@Table(name = "ipo_listing")
public class IpoListing {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(length = 40)
    private String symbol;

    @Column(nullable = false, length = 20)
    private String category = "Mainboard";

    @Column(name = "price_band_low", precision = 12, scale = 2)
    private BigDecimal priceBandLow;

    @Column(name = "price_band_high", precision = 12, scale = 2)
    private BigDecimal priceBandHigh;

    @Column(name = "issue_price", precision = 12, scale = 2)
    private BigDecimal issuePrice;

    @Column(name = "lot_size")
    private Integer lotSize;

    @Column(name = "open_date")      private LocalDate openDate;
    @Column(name = "close_date")     private LocalDate closeDate;
    @Column(name = "allotment_date") private LocalDate allotmentDate;
    @Column(name = "listing_date")   private LocalDate listingDate;

    @Column(length = 1000)
    private String notes;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getSymbol() { return symbol; }
    public void setSymbol(String symbol) { this.symbol = symbol; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public BigDecimal getPriceBandLow() { return priceBandLow; }
    public void setPriceBandLow(BigDecimal v) { this.priceBandLow = v; }
    public BigDecimal getPriceBandHigh() { return priceBandHigh; }
    public void setPriceBandHigh(BigDecimal v) { this.priceBandHigh = v; }
    public BigDecimal getIssuePrice() { return issuePrice; }
    public void setIssuePrice(BigDecimal v) { this.issuePrice = v; }
    public Integer getLotSize() { return lotSize; }
    public void setLotSize(Integer lotSize) { this.lotSize = lotSize; }
    public LocalDate getOpenDate() { return openDate; }
    public void setOpenDate(LocalDate d) { this.openDate = d; }
    public LocalDate getCloseDate() { return closeDate; }
    public void setCloseDate(LocalDate d) { this.closeDate = d; }
    public LocalDate getAllotmentDate() { return allotmentDate; }
    public void setAllotmentDate(LocalDate d) { this.allotmentDate = d; }
    public LocalDate getListingDate() { return listingDate; }
    public void setListingDate(LocalDate d) { this.listingDate = d; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime t) { this.updatedAt = t; }
}
