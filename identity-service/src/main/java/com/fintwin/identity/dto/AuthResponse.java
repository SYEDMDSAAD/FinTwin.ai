package com.fintwin.identity.dto;

public class AuthResponse {

    private String accessToken;
    private String refreshToken;
    private String email;
    private String fullName;
    private String role;

    // 2FA pending — client should show 2FA prompt
    private boolean requires2FA;
    private String twoFactorToken;

    // Full login response
    public AuthResponse(String accessToken, String refreshToken, String email, String fullName, String role) {
        this.accessToken  = accessToken;
        this.refreshToken = refreshToken;
        this.email        = email;
        this.fullName     = fullName;
        this.role         = role;
    }

    // 2FA pending response
    public AuthResponse(String twoFactorToken) {
        this.requires2FA    = true;
        this.twoFactorToken = twoFactorToken;
    }

    public String getAccessToken() { return accessToken; }
    public String getRefreshToken() { return refreshToken; }
    public String getEmail() { return email; }
    public String getFullName() { return fullName; }
    public String getRole() { return role; }
    public boolean isRequires2FA() { return requires2FA; }
    public String getTwoFactorToken() { return twoFactorToken; }
}
