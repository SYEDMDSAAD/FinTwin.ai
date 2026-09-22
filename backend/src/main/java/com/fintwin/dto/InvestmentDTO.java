package com.fintwin.dto;

import java.time.LocalDate;

public class InvestmentDTO {

    private Long id;
    private String name;
    private String type;
    private Double investedAmount;
    private Double currentValue;
    private Double pnl;
    private Double pnlPercent;
    private LocalDate purchaseDate;
    private String notes;
    private String tickerCode;
    private Double units;
    private Double interestRate;
    private String ipoStatus;
    private Long ipoListingId;
    // Auto-detect only: how many payments a suggestion is made of, and each
    // of them — payments to one payee can be one investment or several
    private Integer payments;
    private java.util.List<java.util.Map<String, Object>> breakdown;
    // After a save: "live" when a price came back, "not_found" when the market
    // doesn't know the symbol, "unavailable" when the lookup itself failed
    private String priceStatus;

    public static InvestmentDTO from(com.fintwin.model.Investment inv) {
        InvestmentDTO dto = new InvestmentDTO();
        dto.id            = inv.getId();
        dto.name          = inv.getName();
        dto.type          = inv.getType();
        dto.investedAmount = inv.getInvestedAmount();
        dto.currentValue  = inv.getCurrentValue();
        dto.purchaseDate  = inv.getPurchaseDate();
        dto.notes         = inv.getNotes();
        dto.tickerCode    = inv.getTickerCode();
        dto.units         = inv.getUnits();
        dto.interestRate  = inv.getInterestRate();
        dto.ipoStatus     = inv.getIpoStatus();
        dto.ipoListingId  = inv.getIpoListingId();

        double invested = inv.getInvestedAmount() != null ? inv.getInvestedAmount() : 0;
        double current  = inv.getCurrentValue()   != null ? inv.getCurrentValue()   : invested;

        dto.pnl        = Math.round((current - invested) * 100.0) / 100.0;
        dto.pnlPercent = invested > 0
                ? Math.round(((current - invested) / invested) * 10000.0) / 100.0
                : 0.0;
        return dto;
    }

    // getters
    public String getIpoStatus()    { return ipoStatus; }
    public Long getIpoListingId()   { return ipoListingId; }
    public Long getId()             { return id; }
    public String getName()         { return name; }
    public String getType()         { return type; }
    public Double getInvestedAmount(){ return investedAmount; }
    public Double getCurrentValue() { return currentValue; }
    public Double getPnl()          { return pnl; }
    public Double getPnlPercent()   { return pnlPercent; }
    public LocalDate getPurchaseDate(){ return purchaseDate; }
    public String getNotes()        { return notes; }
    public String getTickerCode()   { return tickerCode; }
    public Double getUnits()        { return units; }
    public Integer getPayments()    { return payments; }
    public void setPayments(Integer v) { this.payments = v; }
    public String getPriceStatus()  { return priceStatus; }
    public void setPriceStatus(String v) { this.priceStatus = v; }
    public java.util.List<java.util.Map<String, Object>> getBreakdown() { return breakdown; }
    public void setBreakdown(java.util.List<java.util.Map<String, Object>> v) { this.breakdown = v; }
    public Double getInterestRate() { return interestRate; }
}
