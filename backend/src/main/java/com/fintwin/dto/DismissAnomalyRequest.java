package com.fintwin.dto;

public class DismissAnomalyRequest {
    private String type;
    private String merchant;
    private String category;
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getMerchant() { return merchant; }
    public void setMerchant(String merchant) { this.merchant = merchant; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
}
