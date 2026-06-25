package com.fintwin.identity.dto;

public class TokenIntrospectResponse {

    private boolean active;
    private String email;
    private String role;
    private String fullName;
    private Boolean onboardingCompleted;
    private String impersonatedBy;
    private String error;

    public static TokenIntrospectResponse valid(String email, String role, String fullName,
                                                Boolean onboardingCompleted, String impersonatedBy) {
        TokenIntrospectResponse r = new TokenIntrospectResponse();
        r.active              = true;
        r.email               = email;
        r.role                = role;
        r.fullName            = fullName;
        r.onboardingCompleted = onboardingCompleted;
        r.impersonatedBy      = impersonatedBy;
        return r;
    }

    public static TokenIntrospectResponse invalid(String reason) {
        TokenIntrospectResponse r = new TokenIntrospectResponse();
        r.active = false;
        r.error  = reason;
        return r;
    }

    public boolean isActive() { return active; }
    public String getEmail() { return email; }
    public String getRole() { return role; }
    public String getFullName() { return fullName; }
    public Boolean getOnboardingCompleted() { return onboardingCompleted; }
    public String getImpersonatedBy() { return impersonatedBy; }
    public String getError() { return error; }
}
