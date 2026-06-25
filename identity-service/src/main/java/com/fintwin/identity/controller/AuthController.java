package com.fintwin.identity.controller;

import com.fintwin.identity.dto.*;
import com.fintwin.identity.service.AuthService;
import com.fintwin.identity.service.TokenService;
import com.fintwin.identity.service.TwoFactorService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired private AuthService authService;
    @Autowired private TwoFactorService twoFactorService;

    @PostMapping("/register")
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest req) {
        return ResponseEntity.ok(authService.register(req));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest req) {
        return ResponseEntity.ok(authService.login(req));
    }

    @PostMapping("/google")
    public ResponseEntity<?> googleLogin(@RequestBody GoogleLoginRequest req) {
        return ResponseEntity.ok(authService.googleLogin(req.getCredential()));
    }

    // Completes 2FA flow: exchanges (tempToken + TOTP code) for real access+refresh tokens
    @PostMapping("/2fa/login")
    public ResponseEntity<?> twoFactorLogin(@RequestBody Map<String, String> body) {
        String tempToken = body.get("twoFactorToken");
        String code      = body.get("code");
        if (tempToken == null || code == null)
            return ResponseEntity.badRequest().body(Map.of("error", "twoFactorToken and code are required"));
        return ResponseEntity.ok(twoFactorService.completeTwoFactorLogin(tempToken, code));
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(@Valid @RequestBody LogoutRequest req) {
        authService.logout(req.getRefreshToken());
        return ResponseEntity.ok(Map.of("message", "Logged out successfully"));
    }

    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(@Valid @RequestBody RefreshTokenRequest req) {
        TokenService.RefreshResult result = authService.refresh(req.getRefreshToken());
        return ResponseEntity.ok(Map.of(
            "accessToken",  result.accessToken(),
            "refreshToken", result.refreshToken()
        ));
    }

    @PostMapping("/change-password")
    public ResponseEntity<?> changePassword(@Valid @RequestBody ChangePasswordRequest req) {
        authService.changePassword(req.getCurrentPassword(), req.getNewPassword());
        return ResponseEntity.ok(Map.of("message", "Password changed. All sessions have been revoked."));
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@RequestBody ForgotPasswordRequest req) {
        String devUrl = authService.forgotPassword(req.getEmail());
        if (devUrl != null) {
            Map<String, String> body = new LinkedHashMap<>();
            body.put("message", "Email not configured — use the link below to test reset:");
            body.put("devResetUrl", devUrl);
            return ResponseEntity.ok(body);
        }
        return ResponseEntity.ok(Map.of("message", "Password reset link sent to your email."));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@RequestBody ResetPasswordRequest req) {
        authService.resetPassword(req.getToken(), req.getNewPassword());
        return ResponseEntity.ok(Map.of("message", "Password updated successfully."));
    }

    @PostMapping("/verify-email")
    public ResponseEntity<?> verifyEmail(@RequestBody VerifyEmailRequest req) {
        authService.verifyEmail(req.getEmail(), req.getOtp());
        return ResponseEntity.ok(Map.of("message", "Email verified successfully."));
    }

    @PostMapping("/resend-verification")
    public ResponseEntity<?> resendVerification(@RequestBody ForgotPasswordRequest req) {
        String devOtp = authService.resendVerification(req.getEmail());
        if (devOtp != null) {
            Map<String, String> body = new LinkedHashMap<>();
            body.put("message", "Email not configured — use OTP below for testing:");
            body.put("devOtp", devOtp);
            return ResponseEntity.ok(body);
        }
        return ResponseEntity.ok(Map.of("message", "Verification code resent."));
    }

    @GetMapping("/me")
    public ResponseEntity<?> me() {
        return ResponseEntity.ok(authService.getMe());
    }
}
