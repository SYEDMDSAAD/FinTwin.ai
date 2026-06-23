package com.fintwin.dto;

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

    public AdminUserDTO(
            Long id,
            String fullName,
            String email,
            String role,
            Boolean enabled,
            LocalDateTime createdAt,
            Boolean onboardingCompleted,
            Boolean twoFactorEnabled
    ) {
        this.id = id;
        this.fullName = fullName;
        this.email = email;
        this.role = role;
        this.enabled = enabled;
        this.createdAt = createdAt;
        this.onboardingCompleted = onboardingCompleted;
        this.twoFactorEnabled = twoFactorEnabled;
    }

    public Long getId()                     { return id; }
    public String getFullName()             { return fullName; }
    public String getEmail()                { return email; }
    public String getRole()                 { return role; }
    public Boolean getEnabled()             { return enabled; }
    public LocalDateTime getCreatedAt()     { return createdAt; }
    public Boolean getOnboardingCompleted() { return onboardingCompleted; }
    public Boolean getTwoFactorEnabled()    { return twoFactorEnabled; }
}
