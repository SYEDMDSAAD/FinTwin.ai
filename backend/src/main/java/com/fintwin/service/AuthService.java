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
import com.fintwin.exception.BadRequestException;
import com.fintwin.exception.ConflictException;
import com.fintwin.exception.ForbiddenException;
import com.fintwin.exception.LockedException;
import com.fintwin.exception.NotFoundException;
import com.fintwin.exception.UnauthorizedException;

import com.fintwin.config.FinTwinMetrics;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    // Account lockout: after this many consecutive failures, lock for LOCK_MINUTES.
    private static final int MAX_FAILED_LOGINS = 5;
    private static final int LOCK_MINUTES = 15;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private EmailService emailService;

    @Autowired
    private SmsService smsService;

    @Autowired
    private FinTwinMetrics metrics;

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

        String normalizedEmail = request.getEmail().toLowerCase().trim();

        if (userRepository.findByEmail(normalizedEmail).isPresent()) {
            throw new ConflictException(
                    "An account with this email already exists"
            );
        }

        // Build the verification OTP up front so the new user is persisted in a
        // single save (atomic) rather than two sequential saves.
        String rawOtp = String.valueOf(100000 + new SecureRandom().nextInt(900000));

        User user = new User();
        user.setFullName(request.getFullName().trim());
        user.setEmail(normalizedEmail);
        user.setEmailHash(EmailHashUtil.hash(normalizedEmail));
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setOnboardingCompleted(false);
        user.setConsentGivenAt(LocalDateTime.now());
        user.setRole("USER");
        user.setEmailVerificationOtp(sha256(rawOtp));
        user.setEmailVerificationExpiry(LocalDateTime.now().plusMinutes(10));

        userRepository.save(user);
        metrics.registrations.increment();

        emailService.sendVerificationOtp(normalizedEmail, request.getFullName().trim(), rawOtp);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", "Registration successful");
        // Returned only in local dev, where there is no mail provider to send it
        if (emailService.canRevealSecrets()) {
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
                        new UnauthorizedException("Invalid credentials")
                );

        // Reject while a temporary lockout is active (brute-force protection).
        if (user.getLockedUntil() != null
                && user.getLockedUntil().isAfter(LocalDateTime.now())) {
            metrics.loginFailure.increment();
            throw new LockedException(
                    "Account temporarily locked due to repeated failed logins. Try again later.");
        }

        if (!passwordEncoder.matches(
                request.getPassword(),
                user.getPassword()
        )) {
            registerFailedLogin(user);
            metrics.loginFailure.increment();
            throw new UnauthorizedException("Invalid credentials");
        }

        if (!Boolean.TRUE.equals(user.getEnabled())) {
            metrics.loginFailure.increment();
            throw new ForbiddenException("ACCOUNT_DISABLED");
        }

        // Successful credential check — clear any prior failure/lock state.
        if (user.getFailedLoginAttempts() != 0 || user.getLockedUntil() != null) {
            user.setFailedLoginAttempts(0);
            user.setLockedUntil(null);
            userRepository.save(user);
        }

        if (Boolean.TRUE.equals(user.getTwoFactorEnabled())) {
            String tempToken = jwtUtil.generateTempToken(user.getEmail());
            metrics.loginSuccess.increment();
            return new AuthResponse(tempToken);
        }

        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);

        metrics.loginSuccess.increment();
        // SMS login alert — fire-and-forget, never blocks the login response
        if (user.getPhone() != null && Boolean.TRUE.equals(user.getPhoneVerified())) {
            smsService.sendLoginAlert(user.getPhone(), "India");
        }

        String token = jwtUtil.generateToken(user.getEmail(), user.getRole());

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
            throw new UnauthorizedException(
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
                throw new UnauthorizedException(
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
                user.setRole("USER");
                userRepository.save(user);
            }

            user.setLastLoginAt(LocalDateTime.now());
            userRepository.save(user);

            String token = jwtUtil.generateToken(email, user.getRole());

            return new AuthResponse(
                    token,
                    user.getEmail(),
                    user.getFullName(),
                    user.getRole()
            );

        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            // Don't leak the underlying provider error to the client.
            log.warn("Google authentication failed", e);
            throw new UnauthorizedException("Google authentication failed");
        }
    }

    // =========================
    // FORGOT PASSWORD
    // =========================

    public String forgotPassword(String email) {
        if (email == null || email.isBlank())
            throw new IllegalArgumentException("Email must not be empty");

        String normalized = email.toLowerCase().trim();
        // Do NOT reveal whether the account exists — that enables email enumeration.
        // Silently no-op for unknown emails; the controller returns a generic response.
        User user = userRepository.findByEmail(normalized).orElse(null);
        if (user == null) {
            return null;
        }

        String rawToken = UUID.randomUUID().toString();
        user.setPasswordResetToken(sha256(rawToken));
        user.setPasswordResetExpiry(LocalDateTime.now().plusMinutes(30));
        userRepository.save(user);

        String resetUrl = appBaseUrl + "/reset-password?token=" + rawToken;
        emailService.sendPasswordResetLink(normalized, user.getFullName(), resetUrl);

        // Return reset URL only when email is not configured (dev/local mode)
        return emailService.canRevealSecrets() ? resetUrl : null;
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
                .orElseThrow(() -> new BadRequestException("Invalid or expired reset link"));

        if (user.getPasswordResetExpiry() == null
                || user.getPasswordResetExpiry().isBefore(LocalDateTime.now())) {
            throw new BadRequestException("Reset link has expired — please request a new one");
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
                .orElseThrow(() -> new NotFoundException("User not found"));

        if (Boolean.TRUE.equals(user.getEmailVerified())) return; // already verified

        if (user.getEmailVerificationOtp() == null
                || user.getEmailVerificationExpiry() == null
                || user.getEmailVerificationExpiry().isBefore(LocalDateTime.now())) {
            throw new BadRequestException("OTP has expired — please request a new one");
        }

        if (!sha256(otp.trim()).equals(user.getEmailVerificationOtp()))
            throw new BadRequestException("Incorrect OTP");

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

        return emailService.canRevealSecrets() ? rawOtp : null;
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
    // PHONE VERIFICATION
    // =========================

    public Map<String, Object> sendPhoneOtp(String phone) {
        if (phone == null || phone.isBlank())
            throw new IllegalArgumentException("Phone number must not be empty");

        String email = SecurityUtils.getCurrentUserEmail();
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new NotFoundException("User not found"));

        user.setPhone(phone.trim());
        String rawOtp = String.valueOf(100000 + new SecureRandom().nextInt(900000));
        user.setPhoneVerificationOtp(sha256(rawOtp));
        user.setPhoneVerificationExpiry(LocalDateTime.now().plusMinutes(10));
        userRepository.save(user);

        smsService.sendOtp(phone.trim(), rawOtp);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", "OTP sent to your phone number");
        if (smsService.canRevealSecrets()) {
            result.put("devOtp", rawOtp);
            result.put("devNote", "SMS not configured — use this OTP directly for testing");
        }
        return result;
    }

    public void verifyPhone(String otp) {
        if (otp == null || otp.isBlank())
            throw new IllegalArgumentException("OTP must not be empty");

        String email = SecurityUtils.getCurrentUserEmail();
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new NotFoundException("User not found"));

        if (Boolean.TRUE.equals(user.getPhoneVerified())) return;

        if (user.getPhoneVerificationOtp() == null
                || user.getPhoneVerificationExpiry() == null
                || user.getPhoneVerificationExpiry().isBefore(LocalDateTime.now())) {
            throw new BadRequestException("OTP has expired — please request a new one");
        }

        if (!sha256(otp.trim()).equals(user.getPhoneVerificationOtp()))
            throw new BadRequestException("Incorrect OTP");

        user.setPhoneVerified(true);
        user.setPhoneVerificationOtp(null);
        user.setPhoneVerificationExpiry(null);
        userRepository.save(user);
    }

    // =========================
    // PRIVATE HELPERS
    // =========================

    // Records a failed login and locks the account once the threshold is crossed.
    private void registerFailedLogin(User user) {
        LocalDateTime now = LocalDateTime.now();

        int attempts = user.getFailedLoginAttempts();
        // If an earlier lock has already expired, start counting fresh.
        if (user.getLockedUntil() != null && user.getLockedUntil().isBefore(now)) {
            attempts = 0;
            user.setLockedUntil(null);
        }
        attempts++;

        if (attempts >= MAX_FAILED_LOGINS) {
            user.setLockedUntil(now.plusMinutes(LOCK_MINUTES));
            user.setFailedLoginAttempts(0); // reset counter; the lock window now governs
        } else {
            user.setFailedLoginAttempts(attempts);
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