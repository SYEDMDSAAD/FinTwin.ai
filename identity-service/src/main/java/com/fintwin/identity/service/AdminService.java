package com.fintwin.identity.service;

import com.fintwin.identity.dto.AdminUserDTO;
import com.fintwin.identity.model.User;
import com.fintwin.identity.repository.UserRepository;
import com.fintwin.identity.security.EmailHashUtil;
import com.fintwin.identity.security.JwtUtil;
import com.fintwin.identity.security.PasswordValidator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

@Service
public class AdminService {

    @Autowired private UserRepository userRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private JwtUtil jwtUtil;
    @Autowired private TokenService tokenService;
    @Autowired private EmailService emailService;

    public Map<String, Object> getStats() {
        long total  = userRepository.count();
        long active = userRepository.countByEnabledTrue();
        long newThisWeek = userRepository.countByCreatedAtAfter(LocalDateTime.now().minusDays(7));
        long admins = userRepository.countByRole("ADMIN");
        long twoFa  = userRepository.countByTwoFactorEnabledTrue();
        long onboarded = userRepository.countByOnboardingCompletedTrue();
        return Map.of(
            "total", total,
            "active", active,
            "newThisWeek", newThisWeek,
            "admins", admins,
            "twoFactorEnabled", twoFa,
            "onboardingCompleted", onboarded
        );
    }

    public Map<String, Object> listUsers(int page, int size) {
        Page<User> pageResult = userRepository.findAll(
                PageRequest.of(page, size, Sort.by("createdAt").descending()));
        return Map.of(
            "content", pageResult.getContent().stream().map(this::toDto).toList(),
            "totalElements", pageResult.getTotalElements(),
            "totalPages", pageResult.getTotalPages(),
            "page", page
        );
    }

    public AdminUserDTO getUser(Long id) {
        return toDto(userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("User not found")));
    }

    @Transactional
    public void deactivate(Long id) {
        User user = userRepository.findById(id).orElseThrow();
        user.setEnabled(false);
        tokenService.revokeAllForUser(id);
        user.setLastLogoutAt(LocalDateTime.now());
        userRepository.save(user);
    }

    @Transactional
    public void activate(Long id) {
        User user = userRepository.findById(id).orElseThrow();
        user.setEnabled(true);
        userRepository.save(user);
    }

    @Transactional
    public void changeRole(Long id, String role) {
        if (!"USER".equals(role) && !"ADMIN".equals(role))
            throw new IllegalArgumentException("Role must be USER or ADMIN");
        User user = userRepository.findById(id).orElseThrow();
        user.setRole(role);
        userRepository.save(user);
    }

    @Transactional
    public void promoteByEmail(String email) {
        User user = userRepository.findByEmail(email.toLowerCase().trim())
                .orElseThrow(() -> new RuntimeException("User not found"));
        user.setRole("ADMIN");
        userRepository.save(user);
    }

    @Transactional
    public void forceLogout(Long id) {
        User user = userRepository.findById(id).orElseThrow();
        user.setLastLogoutAt(LocalDateTime.now());
        tokenService.revokeAllForUser(id);
        userRepository.save(user);
    }

    @Transactional
    public Map<String, Object> resetPassword(Long id) {
        User user = userRepository.findById(id).orElseThrow();
        String tempPassword = UUID.randomUUID().toString().substring(0, 12) + "A1!";
        PasswordValidator.validate(tempPassword);
        user.setPassword(passwordEncoder.encode(tempPassword));
        tokenService.revokeAllForUser(id);
        user.setLastLogoutAt(LocalDateTime.now());
        userRepository.save(user);
        emailService.sendTemporaryPassword(user.getEmail(), user.getFullName(), tempPassword);
        // The temp password goes to the USER's email — returning it to the
        // admin as well would let any admin quietly take over the account.
        // Only exposed when email delivery isn't configured (dev), which the
        // admin UI already handles.
        if (!emailService.isConfigured()) {
            return Map.of("message", "Password reset successfully", "temporaryPassword", tempPassword);
        }
        return Map.of("message", "Password reset — temporary password sent to the user's email");
    }

    public Map<String, Object> impersonate(Long targetId, String adminEmail) {
        User target = userRepository.findById(targetId).orElseThrow();
        // Impersonating another admin would let any admin act with a peer's
        // identity (and covers self-impersonation confusion too).
        if ("ADMIN".equals(target.getRole()))
            throw new IllegalArgumentException("Admin accounts cannot be impersonated");
        String token = jwtUtil.generateImpersonationToken(target.getEmail(), adminEmail);
        return Map.of(
            "accessToken", token,
            "email", target.getEmail(),
            "fullName", target.getFullName(),
            "role", target.getRole(),
            "impersonatedBy", adminEmail
        );
    }

    @Transactional
    public void unlockUser(Long id) {
        User user = userRepository.findById(id).orElseThrow();
        user.setFailedLoginAttempts(0);
        user.setLockedUntil(null);
        userRepository.save(user);
    }

    // Bootstrap: first admin creation via X-Admin-Key (no JWT)
    @Transactional
    public String promoteBootstrap(String email) {
        String normalized = email.toLowerCase().trim();
        User user = userRepository.findByEmail(normalized)
                .orElseThrow(() -> new RuntimeException("User not found: " + normalized));
        user.setRole("ADMIN");
        userRepository.save(user);
        return "User " + normalized + " promoted to ADMIN";
    }

    private AdminUserDTO toDto(User u) {
        return new AdminUserDTO(
            u.getId(), u.getFullName(), u.getEmail(), u.getRole(), u.getEnabled(),
            u.getCreatedAt(), u.getOnboardingCompleted(), u.getTwoFactorEnabled(),
            u.getLastLoginAt(), u.getFailedLoginAttempts(), u.getLockedUntil()
        );
    }
}
