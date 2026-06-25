package com.fintwin.identity.service;

import com.fintwin.identity.dto.*;
import com.fintwin.identity.model.User;
import com.fintwin.identity.repository.UserRepository;
import com.fintwin.identity.security.EmailHashUtil;
import com.fintwin.identity.security.JwtUtil;
import com.fintwin.identity.security.PasswordValidator;
import com.fintwin.identity.security.SecurityUtils;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.*;

@Service
public class AuthService {

    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final int LOCKOUT_MINUTES     = 15;

    @Autowired private UserRepository userRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private JwtUtil jwtUtil;
    @Autowired private TokenService tokenService;
    @Autowired private EmailService emailService;

    @Value("${google.client.id:}")
    private String googleClientId;

    @Value("${app.base-url:http://localhost:5173}")
    private String appBaseUrl;

    // ── Register ──────────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> register(RegisterRequest req) {
        if (req.getEmail() == null || req.getEmail().isBlank())
            throw new IllegalArgumentException("Email must not be empty");
        if (!req.isConsentGiven())
            throw new IllegalArgumentException("You must accept the Privacy Policy to register.");
        PasswordValidator.validate(req.getPassword());
        if (req.getFullName() == null || req.getFullName().isBlank())
            throw new IllegalArgumentException("Full name must not be empty");

        String normalized = req.getEmail().toLowerCase().trim();
        if (userRepository.findByEmail(normalized).isPresent())
            throw new RuntimeException("An account with this email already exists");

        User user = new User();
        user.setFullName(req.getFullName().trim());
        user.setEmail(normalized);
        user.setEmailHash(EmailHashUtil.hash(normalized));
        user.setPassword(passwordEncoder.encode(req.getPassword()));
        user.setOnboardingCompleted(false);
        user.setConsentGivenAt(LocalDateTime.now());
        userRepository.save(user);

        String rawOtp = String.valueOf(100000 + new SecureRandom().nextInt(900000));
        user.setEmailVerificationOtp(sha256(rawOtp));
        user.setEmailVerificationExpiry(LocalDateTime.now().plusMinutes(10));
        userRepository.save(user);
        emailService.sendVerificationOtp(normalized, req.getFullName().trim(), rawOtp);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", "Registration successful");
        if (!emailService.isConfigured()) {
            result.put("devOtp", rawOtp);
            result.put("devNote", "Email not configured — use this OTP directly for testing");
        }
        return result;
    }

    // ── Login ─────────────────────────────────────────────────────────────────

    @Transactional
    public AuthResponse login(LoginRequest req) {
        if (req.getEmail() == null || req.getEmail().isBlank()
                || req.getPassword() == null || req.getPassword().isBlank())
            throw new IllegalArgumentException("Email and password are required");

        String normalized = req.getEmail().toLowerCase().trim();
        User user = userRepository.findByEmail(normalized)
                .orElseThrow(() -> new RuntimeException("Invalid credentials"));

        // Check account lockout
        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(LocalDateTime.now())) {
            long minutesLeft = java.time.Duration.between(LocalDateTime.now(), user.getLockedUntil()).toMinutes() + 1;
            throw new RuntimeException("Account locked due to too many failed attempts. Try again in " + minutesLeft + " minute(s).");
        }

        if (!Boolean.TRUE.equals(user.getEnabled()))
            throw new RuntimeException("Account has been disabled");

        if (!passwordEncoder.matches(req.getPassword(), user.getPassword())) {
            recordFailedAttempt(user);
            throw new RuntimeException("Invalid credentials");
        }

        // Successful login — reset lockout counters
        user.setFailedLoginAttempts(0);
        user.setLockedUntil(null);

        if (Boolean.TRUE.equals(user.getTwoFactorEnabled())) {
            userRepository.save(user);
            return new AuthResponse(jwtUtil.generateTempToken(user.getEmail()));
        }

        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);

        String accessToken  = tokenService.issueAccessToken(user.getEmail());
        String refreshToken = tokenService.issueRefreshToken(user);
        return new AuthResponse(accessToken, refreshToken, user.getEmail(), user.getFullName(), user.getRole());
    }

    // ── Google Login ──────────────────────────────────────────────────────────

    @Transactional
    public AuthResponse googleLogin(String credential) {
        if (credential == null || credential.isBlank())
            throw new RuntimeException("Google credential must not be empty");

        try {
            GoogleIdTokenVerifier verifier = new GoogleIdTokenVerifier.Builder(
                    new NetHttpTransport(), GsonFactory.getDefaultInstance())
                    .setAudience(Collections.singletonList(googleClientId))
                    .build();

            GoogleIdToken idToken = verifier.verify(credential);
            if (idToken == null)
                throw new RuntimeException("Google token verification failed");

            GoogleIdToken.Payload payload = idToken.getPayload();
            String email    = payload.getEmail().toLowerCase().trim();
            String fullName = (String) payload.get("name");
            if (fullName == null || fullName.isBlank()) fullName = email.split("@")[0];

            User user = userRepository.findByEmail(email).orElse(null);
            if (user == null) {
                user = new User();
                user.setEmail(email);
                user.setEmailHash(EmailHashUtil.hash(email));
                user.setFullName(fullName);
                user.setPassword(passwordEncoder.encode(UUID.randomUUID().toString()));
                user.setOnboardingCompleted(false);
                user.setEmailVerified(true);
                userRepository.save(user);
            }

            if (!Boolean.TRUE.equals(user.getEnabled()))
                throw new RuntimeException("Account has been disabled");

            user.setLastLoginAt(LocalDateTime.now());
            userRepository.save(user);

            String accessToken  = tokenService.issueAccessToken(email);
            String refreshToken = tokenService.issueRefreshToken(user);
            return new AuthResponse(accessToken, refreshToken, user.getEmail(), user.getFullName(), user.getRole());

        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Google authentication failed: " + e.getMessage());
        }
    }

    // ── Logout ────────────────────────────────────────────────────────────────

    @Transactional
    public void logout(String rawRefreshToken) {
        tokenService.revokeRefreshToken(rawRefreshToken);
        // Also set lastLogoutAt so the main backend's JwtFilter rejects the old access token
        // if it hasn't expired yet (safety net during the 15-min window).
        String email = SecurityUtils.getCurrentUserEmail();
        userRepository.findByEmail(email).ifPresent(user -> {
            user.setLastLogoutAt(LocalDateTime.now());
            userRepository.save(user);
        });
    }

    // ── Refresh Token ─────────────────────────────────────────────────────────

    public TokenService.RefreshResult refresh(String rawRefreshToken) {
        return tokenService.rotateRefreshToken(rawRefreshToken);
    }

    // ── Change Password ───────────────────────────────────────────────────────

    @Transactional
    public void changePassword(String currentPassword, String newPassword) {
        String email = SecurityUtils.getCurrentUserEmail();
        User user = userRepository.findByEmail(email).orElseThrow();

        if (!passwordEncoder.matches(currentPassword, user.getPassword()))
            throw new RuntimeException("Current password is incorrect");

        PasswordValidator.validate(newPassword);
        user.setPassword(passwordEncoder.encode(newPassword));
        // Revoke all refresh tokens so other sessions are logged out
        tokenService.revokeAllForUser(user.getId());
        user.setLastLogoutAt(LocalDateTime.now());
        userRepository.save(user);
    }

    // ── Forgot Password ───────────────────────────────────────────────────────

    @Transactional
    public String forgotPassword(String email) {
        if (email == null || email.isBlank())
            throw new IllegalArgumentException("Email must not be empty");

        String normalized = email.toLowerCase().trim();
        User user = userRepository.findByEmail(normalized)
                .orElseThrow(() -> new RuntimeException("No account found with that email address"));

        String rawToken = UUID.randomUUID().toString();
        user.setPasswordResetToken(sha256(rawToken));
        user.setPasswordResetExpiry(LocalDateTime.now().plusMinutes(30));
        userRepository.save(user);

        String resetUrl = appBaseUrl + "/reset-password?token=" + rawToken;
        emailService.sendPasswordResetLink(normalized, user.getFullName(), resetUrl);
        return emailService.isConfigured() ? null : resetUrl;
    }

    // ── Reset Password ────────────────────────────────────────────────────────

    @Transactional
    public void resetPassword(String rawToken, String newPassword) {
        if (rawToken == null || rawToken.isBlank())
            throw new IllegalArgumentException("Invalid reset token");

        PasswordValidator.validate(newPassword);
        String hashed = sha256(rawToken);
        User user = userRepository.findByPasswordResetToken(hashed)
                .orElseThrow(() -> new RuntimeException("Invalid or expired reset link"));

        if (user.getPasswordResetExpiry() == null
                || user.getPasswordResetExpiry().isBefore(LocalDateTime.now()))
            throw new RuntimeException("Reset link has expired — please request a new one");

        user.setPassword(passwordEncoder.encode(newPassword));
        user.setPasswordResetToken(null);
        user.setPasswordResetExpiry(null);
        tokenService.revokeAllForUser(user.getId());
        user.setLastLogoutAt(LocalDateTime.now());
        userRepository.save(user);
    }

    // ── Verify Email ──────────────────────────────────────────────────────────

    @Transactional
    public void verifyEmail(String email, String otp) {
        if (email == null || otp == null)
            throw new IllegalArgumentException("Email and OTP are required");

        String normalized = email.toLowerCase().trim();
        User user = userRepository.findByEmail(normalized)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (Boolean.TRUE.equals(user.getEmailVerified())) return;

        if (user.getEmailVerificationOtp() == null
                || user.getEmailVerificationExpiry() == null
                || user.getEmailVerificationExpiry().isBefore(LocalDateTime.now()))
            throw new RuntimeException("OTP has expired — please request a new one");

        if (!sha256(otp.trim()).equals(user.getEmailVerificationOtp()))
            throw new RuntimeException("Incorrect OTP");

        user.setEmailVerified(true);
        user.setEmailVerificationOtp(null);
        user.setEmailVerificationExpiry(null);
        userRepository.save(user);
    }

    // ── Resend Verification ───────────────────────────────────────────────────

    @Transactional
    public String resendVerification(String email) {
        if (email == null || email.isBlank()) return null;
        String normalized = email.toLowerCase().trim();
        User user = userRepository.findByEmail(normalized).orElse(null);
        if (user == null || Boolean.TRUE.equals(user.getEmailVerified())) return null;

        String rawOtp = String.valueOf(100000 + new SecureRandom().nextInt(900000));
        user.setEmailVerificationOtp(sha256(rawOtp));
        user.setEmailVerificationExpiry(LocalDateTime.now().plusMinutes(10));
        userRepository.save(user);
        emailService.sendVerificationOtp(normalized, user.getFullName(), rawOtp);
        return emailService.isConfigured() ? null : rawOtp;
    }

    // ── Get Me ────────────────────────────────────────────────────────────────

    public UserMeDTO getMe() {
        String email = SecurityUtils.getCurrentUserEmail();
        User user = userRepository.findByEmail(email).orElseThrow();
        return new UserMeDTO(
                user.getEmail(),
                user.getFullName(),
                user.getOnboardingCompleted(),
                user.getRole(),
                Boolean.TRUE.equals(user.getEmailVerified()),
                Boolean.TRUE.equals(user.getTwoFactorEnabled())
        );
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void recordFailedAttempt(User user) {
        int attempts = user.getFailedLoginAttempts() + 1;
        user.setFailedLoginAttempts(attempts);
        if (attempts >= MAX_FAILED_ATTEMPTS) {
            user.setLockedUntil(LocalDateTime.now().plusMinutes(LOCKOUT_MINUTES));
        }
        userRepository.save(user);
    }

    private String sha256(String input) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            throw new RuntimeException("SHA-256 unavailable", e);
        }
    }
}
