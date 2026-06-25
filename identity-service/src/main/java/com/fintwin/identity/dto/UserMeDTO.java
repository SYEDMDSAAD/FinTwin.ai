package com.fintwin.identity.dto;

public class UserMeDTO {
    private String email;
    private String fullName;
    private Boolean onboardingCompleted;
    private String role;
    private boolean emailVerified;
    private boolean twoFactorEnabled;

    public UserMeDTO(String email, String fullName, Boolean onboardingCompleted,
                     String role, boolean emailVerified, boolean twoFactorEnabled) {
        this.email               = email;
        this.fullName            = fullName;
        this.onboardingCompleted = onboardingCompleted;
        this.role                = role;
        this.emailVerified       = emailVerified;
        this.twoFactorEnabled    = twoFactorEnabled;
    }

    public String getEmail() { return email; }
    public String getFullName() { return fullName; }
    public Boolean getOnboardingCompleted() { return onboardingCompleted; }
    public String getRole() { return role; }
    public boolean isEmailVerified() { return emailVerified; }
    public boolean isTwoFactorEnabled() { return twoFactorEnabled; }
}
