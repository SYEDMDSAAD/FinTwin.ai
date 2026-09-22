package com.fintwin.dto;

/** An anomaly alert the user is giving a verdict on, with the figures it showed. */
public class DismissAnomalyRequest {
    private String type;
    private String merchant;
    private String category;
    private Double amount;
    private Double avgAmount;
    private Double multiplier;
    private String severity;
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getMerchant() { return merchant; }
    public void setMerchant(String merchant) { this.merchant = merchant; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public Double getAmount() { return amount; }
    public void setAmount(Double amount) { this.amount = amount; }
    public Double getAvgAmount() { return avgAmount; }
    public void setAvgAmount(Double avgAmount) { this.avgAmount = avgAmount; }
    public Double getMultiplier() { return multiplier; }
    public void setMultiplier(Double multiplier) { this.multiplier = multiplier; }
    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }
}
