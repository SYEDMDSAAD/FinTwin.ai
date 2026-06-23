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

        double invested = inv.getInvestedAmount() != null ? inv.getInvestedAmount() : 0;
        double current  = inv.getCurrentValue()   != null ? inv.getCurrentValue()   : invested;

        dto.pnl        = Math.round((current - invested) * 100.0) / 100.0;
        dto.pnlPercent = invested > 0
                ? Math.round(((current - invested) / invested) * 10000.0) / 100.0
                : 0.0;
        return dto;
    }

    // getters
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
    public Double getInterestRate() { return interestRate; }
}
