package com.fintwin.identity.dto;

import java.time.LocalDateTime;

public class AdminUserDTO {
    private Long id;
    private String fullName;
    private String email;
    private String role;
    private Boolean enabled;
    private LocalDateTime createdAt;
    private Boolean onboardingCompleted;
    private Boolean twoFactorEnabled;
    private LocalDateTime lastLoginAt;
    private Integer failedLoginAttempts;
    private LocalDateTime lockedUntil;

    public AdminUserDTO(Long id, String fullName, String email, String role, Boolean enabled,
                        LocalDateTime createdAt, Boolean onboardingCompleted, Boolean twoFactorEnabled,
                        LocalDateTime lastLoginAt, Integer failedLoginAttempts, LocalDateTime lockedUntil) {
        this.id                   = id;
        this.fullName             = fullName;
        this.email                = email;
        this.role                 = role;
        this.enabled              = enabled;
        this.createdAt            = createdAt;
        this.onboardingCompleted  = onboardingCompleted;
        this.twoFactorEnabled     = twoFactorEnabled;
        this.lastLoginAt          = lastLoginAt;
        this.failedLoginAttempts  = failedLoginAttempts;
        this.lockedUntil          = lockedUntil;
    }

    public Long getId() { return id; }
    public String getFullName() { return fullName; }
    public String getEmail() { return email; }
    public String getRole() { return role; }
    public Boolean getEnabled() { return enabled; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public Boolean getOnboardingCompleted() { return onboardingCompleted; }
    public Boolean getTwoFactorEnabled() { return twoFactorEnabled; }
    public LocalDateTime getLastLoginAt() { return lastLoginAt; }
    public Integer getFailedLoginAttempts() { return failedLoginAttempts; }
    public LocalDateTime getLockedUntil() { return lockedUntil; }
}
