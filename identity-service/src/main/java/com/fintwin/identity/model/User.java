package com.fintwin.identity.model;

import com.fintwin.identity.security.EncryptionConverter;
import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Convert(converter = EncryptionConverter.class)
    @Column(length = 512)
    private String fullName;

    @Convert(converter = EncryptionConverter.class)
    @Column(length = 512)
    private String email;

    @Column(name = "email_hash", unique = true, length = 64)
    private String emailHash;

    private String password;

    private LocalDateTime createdAt;

    @Column(name = "onboarding_completed")
    private Boolean onboardingCompleted = false;

    @Convert(converter = EncryptionConverter.class)
    @Column(name = "two_factor_secret", length = 512)
    private String twoFactorSecret;

    @Column(name = "two_factor_enabled")
    private Boolean twoFactorEnabled = false;

    @Column(name = "role", length = 20)
    private String role = "USER";

    @Column(name = "enabled")
    private Boolean enabled = true;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    @Column(name = "last_logout_at")
    private LocalDateTime lastLogoutAt;

    @Column(name = "consent_given_at")
    private LocalDateTime consentGivenAt;

    @Column(name = "email_verified")
    private Boolean emailVerified = false;

    @Column(name = "email_verification_otp", length = 64)
    private String emailVerificationOtp;

    @Column(name = "email_verification_expiry")
    private LocalDateTime emailVerificationExpiry;

    @Column(name = "password_reset_token", length = 64)
    private String passwordResetToken;

    @Column(name = "password_reset_expiry")
    private LocalDateTime passwordResetExpiry;

    // Account lockout — incremented on every failed login, reset on success
    @Column(name = "failed_login_attempts")
    private Integer failedLoginAttempts = 0;

    // Set to now + 15 minutes after 5 consecutive failures
    @Column(name = "locked_until")
    private LocalDateTime lockedUntil;

    public User() {
        this.createdAt = LocalDateTime.now();
    }

    // ── Getters / Setters ──────────────────────────────────────────────────────

    public Long getId() { return id; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getEmailHash() { return emailHash; }
    public void setEmailHash(String emailHash) { this.emailHash = emailHash; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public Boolean getOnboardingCompleted() { return onboardingCompleted; }
    public void setOnboardingCompleted(Boolean v) { this.onboardingCompleted = v; }
    public String getTwoFactorSecret() { return twoFactorSecret; }
    public void setTwoFactorSecret(String s) { this.twoFactorSecret = s; }
    public Boolean getTwoFactorEnabled() { return twoFactorEnabled; }
    public void setTwoFactorEnabled(Boolean v) { this.twoFactorEnabled = v; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled; }
    public LocalDateTime getLastLoginAt() { return lastLoginAt; }
    public void setLastLoginAt(LocalDateTime v) { this.lastLoginAt = v; }
    public LocalDateTime getLastLogoutAt() { return lastLogoutAt; }
    public void setLastLogoutAt(LocalDateTime v) { this.lastLogoutAt = v; }
    public LocalDateTime getConsentGivenAt() { return consentGivenAt; }
    public void setConsentGivenAt(LocalDateTime v) { this.consentGivenAt = v; }
    public Boolean getEmailVerified() { return emailVerified; }
    public void setEmailVerified(Boolean v) { this.emailVerified = v; }
    public String getEmailVerificationOtp() { return emailVerificationOtp; }
    public void setEmailVerificationOtp(String v) { this.emailVerificationOtp = v; }
    public LocalDateTime getEmailVerificationExpiry() { return emailVerificationExpiry; }
    public void setEmailVerificationExpiry(LocalDateTime v) { this.emailVerificationExpiry = v; }
    public String getPasswordResetToken() { return passwordResetToken; }
    public void setPasswordResetToken(String v) { this.passwordResetToken = v; }
    public LocalDateTime getPasswordResetExpiry() { return passwordResetExpiry; }
    public void setPasswordResetExpiry(LocalDateTime v) { this.passwordResetExpiry = v; }
    public Integer getFailedLoginAttempts() { return failedLoginAttempts == null ? 0 : failedLoginAttempts; }
    public void setFailedLoginAttempts(Integer v) { this.failedLoginAttempts = v; }
    public LocalDateTime getLockedUntil() { return lockedUntil; }
    public void setLockedUntil(LocalDateTime v) { this.lockedUntil = v; }
}
