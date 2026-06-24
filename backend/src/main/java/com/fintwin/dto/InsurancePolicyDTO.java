package com.fintwin.dto;

import com.fintwin.model.InsurancePolicy;
import java.time.LocalDate;
import java.time.LocalDateTime;

public class InsurancePolicyDTO {

    private Long id;
    private String type;
    private String provider;
    private String premium;
    private String frequency;
    private String sumAssured;
    private LocalDate renewalDate;
    private String notes;
    private LocalDateTime createdAt;

    public InsurancePolicyDTO() {}

    public static InsurancePolicyDTO from(InsurancePolicy p) {
        InsurancePolicyDTO dto = new InsurancePolicyDTO();
        dto.id = p.getId();
        dto.type = p.getType();
        dto.provider = p.getProvider();
        dto.premium = p.getPremium();
        dto.frequency = p.getFrequency();
        dto.sumAssured = p.getSumAssured();
        dto.renewalDate = p.getRenewalDate();
        dto.notes = p.getNotes();
        dto.createdAt = p.getCreatedAt();
        return dto;
    }

    public Long getId() { return id; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }
    public String getPremium() { return premium; }
    public void setPremium(String premium) { this.premium = premium; }
    public String getFrequency() { return frequency; }
    public void setFrequency(String frequency) { this.frequency = frequency; }
    public String getSumAssured() { return sumAssured; }
    public void setSumAssured(String sumAssured) { this.sumAssured = sumAssured; }
    public LocalDate getRenewalDate() { return renewalDate; }
    public void setRenewalDate(LocalDate renewalDate) { this.renewalDate = renewalDate; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
