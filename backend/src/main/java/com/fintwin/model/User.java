package com.fintwin.model;

import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fintwin.security.EncryptionConverter;
import com.fintwin.security.Permission;
import com.fintwin.security.Role;
import java.time.LocalDateTime;
import java.util.Set;

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

    @JsonIgnore
    private String password;

    // Deterministic HMAC-SHA256 of email — used for DB lookups since
    // AES-GCM (above) is non-deterministic and can't be queried directly
    @JsonIgnore
    @Column(name = "email_hash", unique = true, length = 64)
    private String emailHash;

    private LocalDateTime createdAt;

    private Boolean onboardingCompleted = false;

    @JsonIgnore
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

    // GDPR Article 7 — timestamp of explicit user consent at registration
    @Column(name = "consent_given_at")
    private LocalDateTime consentGivenAt;

    @Column(name = "email_verified")
    private Boolean emailVerified = false;

    // Phone (AES-256-GCM encrypted, same as email)
    @Convert(converter = EncryptionConverter.class)
    @Column(name = "phone", length = 512)
    private String phone;

    @Column(name = "phone_verified")
    private Boolean phoneVerified = false;

    // SHA-256 of phone OTP (raw OTP only ever sent via SMS)
    @JsonIgnore
    @Column(name = "phone_verification_otp", length = 64)
    private String phoneVerificationOtp;

    @Column(name = "phone_verification_expiry")
    private LocalDateTime phoneVerificationExpiry;

    // SHA-256 hash of the OTP (raw OTP is only ever in the email)
    @JsonIgnore
    @Column(name = "email_verification_otp", length = 64)
    private String emailVerificationOtp;

    @Column(name = "email_verification_expiry")
    private LocalDateTime emailVerificationExpiry;

    // SHA-256 hash of the reset token sent via email link
    @JsonIgnore
    @Column(name = "password_reset_token", length = 64)
    private String passwordResetToken;

    @Column(name = "password_reset_expiry")
    private LocalDateTime passwordResetExpiry;

    // Account lockout — managed by identity-service
    @Column(name = "failed_login_attempts")
    private Integer failedLoginAttempts = 0;

    @Column(name = "locked_until")
    private LocalDateTime lockedUntil;

    public User() {
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public Boolean getOnboardingCompleted() {
        return onboardingCompleted;
    }

    public void setOnboardingCompleted(Boolean onboardingCompleted) {
        this.onboardingCompleted = onboardingCompleted;
    }

    public String getEmailHash() {
        return emailHash;
    }

    public void setEmailHash(String emailHash) {
        this.emailHash = emailHash;
    }

    public String getTwoFactorSecret() {
        return twoFactorSecret;
    }

    public void setTwoFactorSecret(String twoFactorSecret) {
        this.twoFactorSecret = twoFactorSecret;
    }

    public Boolean getTwoFactorEnabled() {
        return twoFactorEnabled;
    }

    public void setTwoFactorEnabled(Boolean twoFactorEnabled) {
        this.twoFactorEnabled = twoFactorEnabled;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    public LocalDateTime getLastLoginAt() {
        return lastLoginAt;
    }

    public void setLastLoginAt(LocalDateTime lastLoginAt) {
        this.lastLoginAt = lastLoginAt;
    }

    public LocalDateTime getLastLogoutAt() {
        return lastLogoutAt;
    }

    public void setLastLogoutAt(LocalDateTime lastLogoutAt) {
        this.lastLogoutAt = lastLogoutAt;
    }

    public LocalDateTime getConsentGivenAt() {
        return consentGivenAt;
    }

    public void setConsentGivenAt(LocalDateTime consentGivenAt) {
        this.consentGivenAt = consentGivenAt;
    }

    public Boolean getEmailVerified() { return emailVerified; }
    public void setEmailVerified(Boolean emailVerified) { this.emailVerified = emailVerified; }

    public String getEmailVerificationOtp() { return emailVerificationOtp; }
    public void setEmailVerificationOtp(String emailVerificationOtp) { this.emailVerificationOtp = emailVerificationOtp; }

    public LocalDateTime getEmailVerificationExpiry() { return emailVerificationExpiry; }
    public void setEmailVerificationExpiry(LocalDateTime emailVerificationExpiry) { this.emailVerificationExpiry = emailVerificationExpiry; }

    public String getPasswordResetToken() { return passwordResetToken; }
    public void setPasswordResetToken(String passwordResetToken) { this.passwordResetToken = passwordResetToken; }

    public LocalDateTime getPasswordResetExpiry() { return passwordResetExpiry; }
    public void setPasswordResetExpiry(LocalDateTime passwordResetExpiry) { this.passwordResetExpiry = passwordResetExpiry; }

    public Integer getFailedLoginAttempts() { return failedLoginAttempts == null ? 0 : failedLoginAttempts; }
    public void setFailedLoginAttempts(Integer v) { this.failedLoginAttempts = v; }
    public LocalDateTime getLockedUntil() { return lockedUntil; }
    public void setLockedUntil(LocalDateTime v) { this.lockedUntil = v; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public Boolean getPhoneVerified() { return phoneVerified; }
    public void setPhoneVerified(Boolean phoneVerified) { this.phoneVerified = phoneVerified; }
    public String getPhoneVerificationOtp() { return phoneVerificationOtp; }
    public void setPhoneVerificationOtp(String phoneVerificationOtp) { this.phoneVerificationOtp = phoneVerificationOtp; }
    public LocalDateTime getPhoneVerificationExpiry() { return phoneVerificationExpiry; }
    public void setPhoneVerificationExpiry(LocalDateTime phoneVerificationExpiry) { this.phoneVerificationExpiry = phoneVerificationExpiry; }

    // ── RBAC helpers ─────────────────────────────────────────────────

    public Role getRoleEnum() {
        return Role.fromString(role);
    }

    public Set<Permission> getAllPermissions() {
        return getRoleEnum().getPermissions();
    }

    public boolean hasPermission(Permission permission) {
        return getAllPermissions().contains(permission);
    }

    public boolean hasRole(Role r) {
        return getRoleEnum() == r;
    }
}