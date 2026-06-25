package com.fintwin.identity.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;

public class LoginRequest {

    @Email
    private String email;

    @Size(min = 8, max = 128)
    private String password;

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
}
