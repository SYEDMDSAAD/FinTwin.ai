package com.fintwin.dto;

public class AuthResponse {

    private String token;
    private String email;
    private String fullName;
    private String role;
    private boolean requires2FA;
    private String twoFactorToken;

    public AuthResponse(String token, String email, String fullName, String role) {
        this.token = token;
        this.email = email;
        this.fullName = fullName;
        this.role = role;
        this.requires2FA = false;
        this.twoFactorToken = null;
    }

    public AuthResponse(String twoFactorToken) {
        this.requires2FA = true;
        this.twoFactorToken = twoFactorToken;
    }

    public String getToken()          { return token; }
    public String getEmail()          { return email; }
    public String getFullName()       { return fullName; }
    public String getRole()           { return role; }
    public boolean isRequires2FA()    { return requires2FA; }
    public String getTwoFactorToken() { return twoFactorToken; }
}
