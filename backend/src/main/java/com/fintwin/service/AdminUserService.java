package com.fintwin.service;

import com.fintwin.audit.AuditLog;
import com.fintwin.audit.AuditLogRepository;
import com.fintwin.audit.AuditService;
import com.fintwin.dto.*;
import com.fintwin.model.User;
import com.fintwin.repository.*;
import com.fintwin.security.JwtUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Owns all admin-level user management, analytics, and platform health operations.
 * AdminApiController and AdminController delegate here; neither touches repositories directly.
 */
@Service
public class AdminUserService {

    private static final Logger log = LoggerFactory.getLogger(AdminUserService.class);
    private static final SecureRandom SECURE_RNG = new SecureRandom();

    @Autowired private UserRepository userRepository;
    @Autowired private AuditLogRepository auditLogRepository;
    @Autowired private AuditService auditService;
    @Autowired private TransactionRepository transactionRepository;
    @Autowired private FinancialGoalRepository goalRepository;
    @Autowired private ChatHistoryRepository chatHistoryRepository;
    @Autowired private BankConnectionRepository bankConnectionRepository;
    @Autowired private JwtUtil jwtUtil;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private ProfileService profileService;
    @Autowired private EmailService emailService;
    @Autowired @org.springframework.beans.factory.annotation.Qualifier("aiRestTemplate") private RestTemplate aiRestTemplate;

    @Value("${ai.service.url:http://localhost:8000}")
    private String aiServiceUrl;

    // ── Stats ─────────────────────────────────────────────────────────────────

    @PreAuthorize("hasAuthority('READ_AGGREGATE_ANALYTICS')")
    public AdminStatsDTO getStats() {
        // Single SQL round-trip to Supabase instead of 4 separate COUNT queries
        Object[] row     = userRepository.countUserStats(LocalDateTime.now().minusDays(7)).get(0);
        long total       = ((Number) row[0]).longValue();
        long active      = ((Number) row[1]).longValue();
        long newThisWeek = ((Number) row[2]).longValue();
        long admins      = ((Number) row[3]).longValue();
        return new AdminStatsDTO(total, active, newThisWeek, admins);
    }

    // ── Users list ────────────────────────────────────────────────────────────

    @PreAuthorize("hasAuthority('READ_ALL_USERS')")
    public Map<String, Object> listUsers(int page, int size) {
        var pg = userRepository.findAll(PageRequest.of(page, size, org.springframework.data.domain.Sort.by("createdAt").descending()));
        List<AdminUserDTO> users = pg.getContent().stream()
                .map(u -> new AdminUserDTO(
                        u.getId(), u.getFullName(), u.getEmail(),
                        u.getRole() != null ? u.getRole() : "USER",
                        Boolean.TRUE.equals(u.getEnabled()),
                        u.getCreatedAt(), u.getOnboardingCompleted(),
                        Boolean.TRUE.equals(u.getTwoFactorEnabled())))
                .collect(Collectors.toList());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("content", users);
        result.put("totalElements", pg.getTotalElements());
        result.put("totalPages", pg.getTotalPages());
        result.put("page", page);
        return result;
    }

    // ── User detail ───────────────────────────────────────────────────────────

    @PreAuthorize("hasAuthority('READ_ANY_USER_PROFILE')")
    public Optional<UserDetailDTO> getUserDetail(Long id) {
        return userRepository.findById(id).map(u -> {
            UserDetailDTO dto = new UserDetailDTO();
            dto.setId(u.getId());
            dto.setFullName(u.getFullName());
            dto.setEmail(u.getEmail());
            dto.setRole(u.getRole() != null ? u.getRole() : "USER");
            dto.setEnabled(Boolean.TRUE.equals(u.getEnabled()));
            dto.setCreatedAt(u.getCreatedAt());
            dto.setLastLoginAt(u.getLastLoginAt());
            dto.setOnboardingCompleted(u.getOnboardingCompleted());
            dto.setTwoFactorEnabled(u.getTwoFactorEnabled());
            dto.setTransactionCount(transactionRepository.countByUser(u));
            dto.setGoalCount(goalRepository.countByUser(u));
            dto.setChatCount(chatHistoryRepository.countByUser(u));
            dto.setHasBankConnected(bankConnectionRepository.countByUser(u) > 0);
            List<AuditLogDTO> recentActivity = auditLogRepository
                    .findByUserId(u.getId(), PageRequest.of(0, 10))
                    .getContent().stream().map(AuditLogDTO::from).collect(Collectors.toList());
            dto.setRecentActivity(recentActivity);
            return dto;
        });
    }

    // ── Enable / Disable ─────────────────────────────────────────────────────

    @PreAuthorize("hasAuthority('FREEZE_ANY_ACCOUNT')")
    public void deactivateUser(Long id, String adminEmail, String ip, String ua, String method, String uri) {
        User user = findOrThrow(id);
        if (user.getEmail().equals(adminEmail))
            throw new IllegalArgumentException("Cannot deactivate your own account.");
        user.setEnabled(false);
        userRepository.save(user);
        audit(adminEmail, "WRITE", "admin/users",
                "Deactivated account: " + user.getEmail() + " (id=" + id + ")", ip, ua, method, uri);
    }

    @PreAuthorize("hasAuthority('FREEZE_ANY_ACCOUNT')")
    public void activateUser(Long id, String adminEmail, String ip, String ua, String method, String uri) {
        User user = findOrThrow(id);
        user.setEnabled(true);
        userRepository.save(user);
        audit(adminEmail, "WRITE", "admin/users",
                "Activated account: " + user.getEmail() + " (id=" + id + ")", ip, ua, method, uri);
    }

    // ── Role change ───────────────────────────────────────────────────────────

    @PreAuthorize("hasAuthority('MANAGE_ROLES')")
    public void changeRole(Long id, String newRole, String adminEmail, String ip, String ua, String method, String uri) {
        if (!"USER".equals(newRole) && !"ADMIN".equals(newRole))
            throw new IllegalArgumentException("Role must be USER or ADMIN.");
        User user = findOrThrow(id);
        if (user.getEmail().equals(adminEmail) && "USER".equals(newRole))
            throw new IllegalArgumentException("Cannot demote your own account.");
        String oldRole = user.getRole() != null ? user.getRole() : "USER";
        user.setRole(newRole);
        userRepository.save(user);
        audit(adminEmail, "WRITE", "admin/users",
                "Role changed for " + user.getEmail() + " (id=" + id + "): " + oldRole + " → " + newRole,
                ip, ua, method, uri);
    }

    // ── Promote by email ──────────────────────────────────────────────────────

    public User promoteToAdmin(String email) {
        User user = userRepository.findByEmail(email.toLowerCase().trim())
                .orElseThrow(() -> new NoSuchElementException("No account found with email: " + email));
        if ("ADMIN".equals(user.getRole()))
            throw new IllegalArgumentException("User is already an admin.");
        user.setRole("ADMIN");
        return userRepository.save(user);
    }

    public void promoteByEmail(String email, String adminEmail, String ip, String ua, String method, String uri) {
        User user = promoteToAdmin(email);
        audit(adminEmail, "WRITE", "admin/users",
                "Promoted to ADMIN: " + user.getEmail() + " (id=" + user.getId() + ")", ip, ua, method, uri);
    }

    // ── Force logout ──────────────────────────────────────────────────────────

    public void forceLogout(Long id, String adminEmail, String ip, String ua, String method, String uri) {
        User user = findOrThrow(id);
        user.setLastLogoutAt(LocalDateTime.now());
        userRepository.save(user);
        audit(adminEmail, "WRITE", "admin/users",
                "Force-logout applied to: " + user.getEmail() + " (id=" + id + ")", ip, ua, method, uri);
    }

    // ── Reset password ────────────────────────────────────────────────────────

    @PreAuthorize("hasAuthority('WRITE_ANY_USER_PROFILE')")
    public Map<String, Object> resetPassword(Long id, String adminEmail, String ip, String ua, String method, String uri) {
        User user = findOrThrow(id);
        String newPassword = generatePassword();
        user.setPassword(passwordEncoder.encode(newPassword));
        user.setLastLogoutAt(LocalDateTime.now());
        userRepository.save(user);
        audit(adminEmail, "WRITE", "admin/users",
                "Password reset for: " + user.getEmail() + " (id=" + id + ")", ip, ua, method, uri);

        if (emailService.isConfigured()) {
            emailService.sendPasswordResetEmail(user.getEmail(), user.getFullName(), newPassword);
            return Map.of("message", "Password reset. Temporary password emailed to " + user.getEmail() + ".");
        }
        return Map.of(
                "temporaryPassword", newPassword,
                "warning", "MAIL_ENABLED is false — configure email to avoid exposing passwords in API responses.",
                "message", "Password reset. Share this with the user securely.");
    }

    // ── Impersonate ───────────────────────────────────────────────────────────

    @PreAuthorize("hasAuthority('WRITE_ANY_USER_PROFILE')")
    public Map<String, Object> impersonate(Long id, String adminEmail, String ip, String ua, String method, String uri) {
        User user = findOrThrow(id);
        if (user.getEmail().equals(adminEmail))
            throw new IllegalArgumentException("Cannot impersonate your own account.");
        if (!Boolean.TRUE.equals(user.getEnabled()))
            throw new IllegalArgumentException("Cannot impersonate a disabled user.");
        // Block impersonating other privileged accounts: the token is minted with
        // the target's email as subject, so impersonating an ADMIN/SUPER_ADMIN would
        // hand the caller that account's full authority — privilege escalation.
        String targetRole = user.getRole() != null ? user.getRole().toUpperCase() : "USER";
        if (targetRole.equals("ADMIN") || targetRole.equals("SUPER_ADMIN"))
            throw new IllegalArgumentException("Cannot impersonate an administrator account.");
        String token = jwtUtil.generateImpersonationToken(user.getEmail(), adminEmail);
        audit(adminEmail, "WRITE", "admin/impersonate",
                "Admin impersonated: " + user.getEmail() + " (id=" + id + ")", ip, ua, method, uri);
        return Map.of(
                "token", token,
                "email", user.getEmail(),
                "fullName", user.getFullName(),
                "role", user.getRole() != null ? user.getRole() : "USER",
                "impersonatedBy", adminEmail
        );
    }

    // ── Delete user ───────────────────────────────────────────────────────────

    @PreAuthorize("hasAuthority('DELETE_ANY_USER')")
    public void deleteUser(Long id, String adminEmail, String ip, String ua, String method, String uri) {
        User user = findOrThrow(id);
        if (user.getEmail().equals(adminEmail))
            throw new IllegalArgumentException("Cannot delete your own account.");
        String deletedEmail = user.getEmail();
        profileService.deleteUserById(id);
        audit(adminEmail, "DELETE", "admin/users",
                "Permanently deleted user: " + deletedEmail + " (id=" + id + ")", ip, ua, method, uri);
    }

    // ── Audit logs ────────────────────────────────────────────────────────────

    @PreAuthorize("hasAuthority('READ_AUDIT_LOGS')")
    public Map<String, Object> getAuditLogs(int page, int size, String action) {
        Page<AuditLog> logs = (action != null && !action.isBlank())
                ? auditLogRepository.findByActionOrderByTimestampDesc(action, PageRequest.of(page, size))
                : auditLogRepository.findAllByOrderByTimestampDesc(PageRequest.of(page, size));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("content", logs.getContent().stream().map(AuditLogDTO::from).collect(Collectors.toList()));
        result.put("totalElements", logs.getTotalElements());
        result.put("totalPages", logs.getTotalPages());
        result.put("page", page);
        return result;
    }

    // ── Analytics ─────────────────────────────────────────────────────────────

    @PreAuthorize("hasAuthority('READ_AGGREGATE_ANALYTICS')")
    public List<Map<String, Object>> getSignupTrend(int days) {
        LocalDateTime since = LocalDateTime.now().minusDays(days);
        // Fetches only recent users — not all users — via indexed created_at filter
        List<User> users = userRepository.findByCreatedAtAfter(since);
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("MMM dd");
        Map<String, Long> buckets = new LinkedHashMap<>();
        for (int i = days - 1; i >= 0; i--) buckets.put(LocalDate.now().minusDays(i).format(fmt), 0L);
        for (User u : users) {
            if (u.getCreatedAt() != null)
                buckets.merge(u.getCreatedAt().toLocalDate().format(fmt), 1L, Long::sum);
        }
        return buckets.entrySet().stream()
                .map(e -> { Map<String, Object> m = new LinkedHashMap<>(); m.put("date", e.getKey()); m.put("count", e.getValue()); return m; })
                .collect(Collectors.toList());
    }

    @PreAuthorize("hasAuthority('READ_AGGREGATE_ANALYTICS')")
    public Map<String, Object> getAdoptionStats() {
        // 2 round-trips instead of 4: one for user counts, one for bank connections
        Object[] row   = userRepository.countAdoptionStats().get(0);
        long total     = ((Number) row[0]).longValue();
        long twoFa     = ((Number) row[1]).longValue();
        long onboarded = ((Number) row[2]).longValue();
        long bankUsers = bankConnectionRepository.countDistinctUsers();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", total);
        result.put("twoFactorEnabled", twoFa);
        result.put("onboardingCompleted", onboarded);
        result.put("bankConnected", bankUsers);
        return result;
    }

    // ── Platform health ───────────────────────────────────────────────────────

    public Map<String, Object> getHealth() {
        boolean aiOnline = false;
        try { aiRestTemplate.getForObject(aiServiceUrl + "/health", String.class); aiOnline = true; }
        catch (Exception ignored) {}
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("aiServiceOnline", aiOnline);
        result.put("aiServiceUrl", aiServiceUrl);
        result.put("dbStatus", "connected");
        result.put("totalUsers", userRepository.count());
        result.put("totalAuditEvents", auditLogRepository.count());
        result.put("failedLoginsToday",     auditLogRepository.countFailedLoginsAfter(LocalDateTime.now().withHour(0).withMinute(0).withSecond(0)));
        result.put("failedLoginsThisWeek",  auditLogRepository.countFailedLoginsAfter(LocalDateTime.now().minusDays(7)));
        return result;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private User findOrThrow(Long id) {
        return userRepository.findById(id).orElseThrow(() -> new NoSuchElementException("User not found: " + id));
    }

    private String generatePassword() {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
        StringBuilder sb = new StringBuilder(12);
        for (int i = 0; i < 12; i++) sb.append(chars.charAt(SECURE_RNG.nextInt(chars.length())));
        return sb.toString();
    }

    private void audit(String adminEmail, String action, String resource, String description,
                       String ip, String ua, String method, String uri) {
        Long adminId = userRepository.findByEmail(adminEmail).map(User::getId).orElse(null);
        auditService.log(adminId, action, resource, description, ip, ua, method, uri, true, null);
    }
}
