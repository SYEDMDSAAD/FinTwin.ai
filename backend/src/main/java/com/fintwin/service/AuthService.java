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

import java.time.LocalDateTime;
import java.util.Collections;

@Service
public class AuthService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtUtil jwtUtil;

    @Value("${google.client.id}")
    private String googleClientId;

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
    public String register(RegisterRequest request) {

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

        return "Registration successful";
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
                user.setPassword(
                        passwordEncoder.encode(
                                java.util.UUID.randomUUID().toString()
                        )
                );
                user.setOnboardingCompleted(false);
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

    public UserMeDTO getMe() {
        String email = SecurityUtils.getCurrentUserEmail();
        User user = userRepository.findByEmail(email).orElseThrow();
        return new UserMeDTO(user.getEmail(), user.getFullName(), user.getOnboardingCompleted(), user.getRole());
    }
}