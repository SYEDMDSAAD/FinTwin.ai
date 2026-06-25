package com.fintwin.controller;

import com.fintwin.dto.LoginRequest;
import com.fintwin.dto.RegisterRequest;
import com.fintwin.dto.AuthResponse;
import com.fintwin.dto.ForgotPasswordRequest;
import com.fintwin.dto.ResetPasswordRequest;
import com.fintwin.dto.VerifyEmailRequest;
import com.fintwin.dto.GoogleLoginRequest;
import com.fintwin.dto.UserMeDTO;
import com.fintwin.service.AuthService;

import java.util.LinkedHashMap;
import java.util.Map;

import jakarta.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private AuthService authService;

    // =========================
    // REGISTER
    // =========================

    @PostMapping("/register")
    public ResponseEntity<?> register(
            @Valid @RequestBody RegisterRequest request
    ) {

        return ResponseEntity.ok(
            authService.register(request)
        );    
    }

    // =========================
    // LOGIN
    // =========================

    @PostMapping("/login")
    public ResponseEntity<?> login(
            @Valid @RequestBody LoginRequest request
    ) {
        return ResponseEntity.ok(
                authService.login(request)
        );
    }

    // =========================
    // GOOGLE LOGIN
    // =========================

    @PostMapping("/google")
    public AuthResponse googleLogin(

            @RequestBody
            GoogleLoginRequest request

    ) {

        return authService.googleLogin(

                request.getCredential()
        );
    }

    // =========================
    // FORGOT PASSWORD
    // =========================

    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@RequestBody ForgotPasswordRequest req) {
        String devUrl = authService.forgotPassword(req.getEmail());
        if (devUrl != null) {
            Map<String, String> body = new LinkedHashMap<>();
            body.put("message", "Email not configured — use the link below to test reset:");
            body.put("devResetUrl", devUrl);
            return ResponseEntity.ok(body);
        }
        return ResponseEntity.ok(Map.of("message", "Password reset link has been sent to your email."));
    }

    // =========================
    // RESET PASSWORD
    // =========================

    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@RequestBody ResetPasswordRequest req) {
        authService.resetPassword(req.getToken(), req.getNewPassword());
        return ResponseEntity.ok("Password updated successfully.");
    }

    // =========================
    // VERIFY EMAIL (OTP)
    // =========================

    @PostMapping("/verify-email")
    public ResponseEntity<?> verifyEmail(@RequestBody VerifyEmailRequest req) {
        authService.verifyEmail(req.getEmail(), req.getOtp());
        return ResponseEntity.ok("Email verified successfully.");
    }

    // =========================
    // RESEND VERIFICATION OTP
    // =========================

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

    // =========================
    // GET CURRENT USER
    // =========================

    @GetMapping("/me")
    public UserMeDTO me() {
        return authService.getMe();
    }
}