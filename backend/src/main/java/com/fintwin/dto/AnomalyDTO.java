package com.fintwin.dto;

public class AnomalyDTO {

    private String merchant;
    private Double amount;
    private Double multiplier;
    private String severity;   // "high", "medium", "low"
    private String category;
    private String reason;     // specific human-readable explanation
    private Double avgAmount;  // baseline the anomaly is measured against
    private String type;       // "merchant_spike", "category_spike", "large_transaction", "burst"

    public AnomalyDTO() {}

    public AnomalyDTO(String merchant, Double amount, Double multiplier) {
        this.merchant = merchant;
        this.amount = amount;
        this.multiplier = multiplier;
    }

    public AnomalyDTO(String merchant, Double amount, Double multiplier,
                      String severity, String category, String reason,
                      Double avgAmount, String type) {
        this.merchant   = merchant;
        this.amount     = amount;
        this.multiplier = multiplier;
        this.severity   = severity;
        this.category   = category;
        this.reason     = reason;
        this.avgAmount  = avgAmount;
        this.type       = type;
    }

    public String getMerchant()   { return merchant; }
    public void   setMerchant(String merchant) { this.merchant = merchant; }
    public Double getAmount()     { return amount; }
    public void   setAmount(Double amount) { this.amount = amount; }
    public Double getMultiplier() { return multiplier; }
    public void   setMultiplier(Double multiplier) { this.multiplier = multiplier; }
    public String getSeverity()   { return severity; }
    public void   setSeverity(String severity) { this.severity = severity; }
    public String getCategory()   { return category; }
    public void   setCategory(String category) { this.category = category; }
    public String getReason()     { return reason; }
    public void   setReason(String reason) { this.reason = reason; }
    public Double getAvgAmount()  { return avgAmount; }
    public void   setAvgAmount(Double avgAmount) { this.avgAmount = avgAmount; }
    public String getType()       { return type; }
    public void   setType(String type) { this.type = type; }
}
