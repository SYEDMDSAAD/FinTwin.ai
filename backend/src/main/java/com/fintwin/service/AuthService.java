package com.fintwin.service;

import com.fintwin.dto.LoginRequest;
import com.fintwin.dto.RegisterRequest;
import com.fintwin.dto.AuthResponse;
import com.fintwin.dto.UserMeDTO;
import com.fintwin.security.EmailHashUtil;
import com.fintwin.security.JwtUtil;
import com.fintwin.security.SecurityUtils;
import com.fintwin.model.User;
import com.fintwin.repository.UserRepository;
import com.fintwin.audit.Audited;
import com.fintwin.security.PasswordValidator;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Service
public class AuthService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private EmailService emailService;

    @Value("${google.client.id}")
    private String googleClientId;

    @Value("${app.base-url:http://localhost:5173}")
    private String appBaseUrl;

    // =========================
    // REGISTER
    // AUDITED: new account creation is a security
    // event — must be logged for PCI-DSS 10.2.
    // =========================

    @Audited(
            action = "WRITE",
            resource = "users",
            description = "New user registration"
    )
    public Map<String, Object> register(RegisterRequest request) {

        if (request.getEmail() == null
                || request.getEmail().isBlank()) {
            throw new IllegalArgumentException(
                    "Email must not be empty"
            );
        }

        if (!request.isConsentGiven())
            throw new IllegalArgumentException(
                    "You must accept the Privacy Policy and consent to data processing to register.");

        PasswordValidator.validate(request.getPassword());

        if (request.getFullName() == null
                || request.getFullName().isBlank()) {
            throw new IllegalArgumentException(
                    "Full name must not be empty"
            );
        }

        if (userRepository.findByEmail(
                request.getEmail().toLowerCase().trim()
        ).isPresent()) {
            throw new RuntimeException(
                    "An account with this email already exists"
            );
        }

        String normalizedEmail = request.getEmail().toLowerCase().trim();
        User user = new User();
        user.setFullName(request.getFullName().trim());
        user.setEmail(normalizedEmail);
        user.setEmailHash(EmailHashUtil.hash(normalizedEmail));
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setOnboardingCompleted(false);
        user.setConsentGivenAt(LocalDateTime.now());

        userRepository.save(user);

        // Send email verification OTP
        String rawOtp = String.valueOf(100000 + new SecureRandom().nextInt(900000));
        user.setEmailVerificationOtp(sha256(rawOtp));
        user.setEmailVerificationExpiry(LocalDateTime.now().plusMinutes(10));
        userRepository.save(user);
        emailService.sendVerificationOtp(normalizedEmail, request.getFullName().trim(), rawOtp);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", "Registration successful");
        // Return OTP in response when email is not configured (dev/local mode only)
        if (!emailService.isConfigured()) {
            result.put("devOtp", rawOtp);
            result.put("devNote", "Email not configured — use this OTP directly for testing");
        }
        return result;
    }

    // =========================
    // LOGIN
    // AUDITED: every login attempt — success and
    // failure — must be logged for PCI-DSS 10.2.4.
    // AuditAspect logs success via @AfterReturning
    // and failure via @AfterThrowing automatically.
    // =========================

    @Audited(
            action = "LOGIN",
            resource = "auth",
            description = "User login attempt"
    )
    public AuthResponse login(LoginRequest request) {

        if (request.getEmail() == null
                || request.getEmail().isBlank()
                || request.getPassword() == null
                || request.getPassword().isBlank()) {
            throw new IllegalArgumentException(
                    "Email and password are required"
            );
        }

        String normalizedEmail =
                request.getEmail().toLowerCase().trim();

        User user = userRepository
                .findByEmail(normalizedEmail)
                .orElseThrow(() ->
                        new RuntimeException("Invalid credentials")
                );

        if (!passwordEncoder.matches(
                request.getPassword(),
                user.getPassword()
        )) {
            throw new RuntimeException("Invalid credentials");
        }

        if (!Boolean.TRUE.equals(user.getEnabled())) {
            throw new RuntimeException("Account has been disabled");
        }

        if (Boolean.TRUE.equals(user.getTwoFactorEnabled())) {
            String tempToken = jwtUtil.generateTempToken(user.getEmail());
            return new AuthResponse(tempToken);
        }

        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);

        String token = jwtUtil.generateToken(user.getEmail());

        return new AuthResponse(
                token,
                user.getEmail(),
                user.getFullName(),
                user.getRole()
        );
    }

    // =========================
    // GOOGLE LOGIN
    // AUDITED: Google OAuth login is still an
    // authentication event — must be logged.
    // =========================

    @Audited(
            action = "LOGIN",
            resource = "auth",
            description = "Google OAuth login attempt"
    )
    public AuthResponse googleLogin(String credential) {

        if (credential == null || credential.isBlank()) {
            throw new RuntimeException(
                    "Google credential must not be empty"
            );
        }

        try {
            GoogleIdTokenVerifier verifier =
                    new GoogleIdTokenVerifier.Builder(
                            new NetHttpTransport(),
                            GsonFactory.getDefaultInstance()
                    )
                    .setAudience(
                            Collections.singletonList(googleClientId)
                    )
                    .build();

            GoogleIdToken idToken = verifier.verify(credential);

            if (idToken == null) {
                throw new RuntimeException(
                        "Google token verification failed"
                );
            }

            GoogleIdToken.Payload payload = idToken.getPayload();

            String email = payload.getEmail().toLowerCase().trim();
            String fullName = (String) payload.get("name");

            if (fullName == null || fullName.isBlank()) {
                fullName = email.split("@")[0];
            }

            User user = userRepository
                    .findByEmail(email)
                    .orElse(null);

            if (user == null) {
                user = new User();
                user.setEmail(email);
                user.setEmailHash(EmailHashUtil.hash(email));
                user.setFullName(fullName);
                user.setPassword(passwordEncoder.encode(UUID.randomUUID().toString()));
                user.setOnboardingCompleted(false);
                user.setEmailVerified(true); // Google already verified the email
                userRepository.save(user);
            }

            user.setLastLoginAt(LocalDateTime.now());
            userRepository.save(user);

            String token = jwtUtil.generateToken(email);

            return new AuthResponse(
                    token,
                    user.getEmail(),
                    user.getFullName(),
                    user.getRole()
            );

        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException(
                    "Google authentication failed: " + e.getMessage()
            );
        }
    }

    // =========================
    // FORGOT PASSWORD
    // =========================

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

        // Return reset URL only when email is not configured (dev/local mode)
        return emailService.isConfigured() ? null : resetUrl;
    }

    // =========================
    // RESET PASSWORD
    // =========================

    public void resetPassword(String rawToken, String newPassword) {
        if (rawToken == null || rawToken.isBlank())
            throw new IllegalArgumentException("Invalid reset token");

        PasswordValidator.validate(newPassword);

        String hashed = sha256(rawToken);
        User user = userRepository.findByPasswordResetToken(hashed)
                .orElseThrow(() -> new RuntimeException("Invalid or expired reset link"));

        if (user.getPasswordResetExpiry() == null
                || user.getPasswordResetExpiry().isBefore(LocalDateTime.now())) {
            throw new RuntimeException("Reset link has expired — please request a new one");
        }

        user.setPassword(passwordEncoder.encode(newPassword));
        user.setPasswordResetToken(null);
        user.setPasswordResetExpiry(null);
        userRepository.save(user);
    }

    // =========================
    // VERIFY EMAIL (OTP)
    // =========================

    public void verifyEmail(String email, String otp) {
        if (email == null || otp == null)
            throw new IllegalArgumentException("Email and OTP are required");

        String normalized = email.toLowerCase().trim();
        User user = userRepository.findByEmail(normalized)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (Boolean.TRUE.equals(user.getEmailVerified())) return; // already verified

        if (user.getEmailVerificationOtp() == null
                || user.getEmailVerificationExpiry() == null
                || user.getEmailVerificationExpiry().isBefore(LocalDateTime.now())) {
            throw new RuntimeException("OTP has expired — please request a new one");
        }

        if (!sha256(otp.trim()).equals(user.getEmailVerificationOtp()))
            throw new RuntimeException("Incorrect OTP");

        user.setEmailVerified(true);
        user.setEmailVerificationOtp(null);
        user.setEmailVerificationExpiry(null);
        userRepository.save(user);
    }

    // =========================
    // RESEND VERIFICATION OTP
    // =========================

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

    // =========================
    // GET ME
    // =========================

    public UserMeDTO getMe() {
        String email = SecurityUtils.getCurrentUserEmail();
        User user = userRepository.findByEmail(email).orElseThrow();
        return new UserMeDTO(
                user.getEmail(),
                user.getFullName(),
                user.getOnboardingCompleted(),
                user.getRole(),
                Boolean.TRUE.equals(user.getEmailVerified())
        );
    }

    // =========================
    // PRIVATE HELPERS
    // =========================

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