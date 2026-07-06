package com.fintwin.model;

import com.fintwin.security.EncryptionConverter;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "insurance_policy")
public class InsurancePolicy {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "type", length = 50)
    private String type;

    // Encrypted (AES-256/GCM). Ciphertext is larger than plaintext, so these
    // use TEXT rather than a bounded VARCHAR to avoid overflow on save.
    @Convert(converter = EncryptionConverter.class)
    @Column(name = "provider", columnDefinition = "TEXT")
    private String provider;

    @Convert(converter = EncryptionConverter.class)
    @Column(name = "premium", columnDefinition = "TEXT")
    private String premium;

    @Column(name = "frequency", length = 20)
    private String frequency;

    @Convert(converter = EncryptionConverter.class)
    @Column(name = "sum_assured", columnDefinition = "TEXT")
    private String sumAssured;

    @Column(name = "renewal_date")
    private LocalDate renewalDate;

    @Convert(converter = EncryptionConverter.class)
    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
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
