package com.fintwin.dto;

public class UserMeDTO {

    private String email;

    private String fullName;

    private Boolean onboardingCompleted;

    private String role;

    public UserMeDTO(
            String email,
            String fullName,
            Boolean onboardingCompleted,
            String role
    ) {

        this.email = email;
        this.fullName = fullName;
        this.onboardingCompleted = onboardingCompleted;
        this.role = role;
    }

    public String getEmail() {
        return email;
    }

    public String getFullName() {
        return fullName;
    }

    public Boolean getOnboardingCompleted() {
        return onboardingCompleted;
    }

    public String getRole() {
        return role;
    }
}