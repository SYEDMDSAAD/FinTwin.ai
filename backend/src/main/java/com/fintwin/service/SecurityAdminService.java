package com.fintwin.service;

import com.fintwin.audit.AuditLogRepository;
import com.fintwin.model.BlockedIP;
import com.fintwin.model.User;
import com.fintwin.repository.BlockedIPRepository;
import com.fintwin.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Owns all security posture queries, brute-force detection, and IP blocking.
 * SecurityAdminController delegates here; it touches no repositories directly.
 */
@Service
public class SecurityAdminService {

    @Autowired private AuditLogRepository auditLogRepository;
    @Autowired private BlockedIPRepository blockedIPRepository;
    @Autowired private UserRepository userRepository;

    // Runtime configuration surfaced to the admin dashboard so misconfigurations
    // (dev-default secrets, plaintext internal transport, unauthenticated Redis)
    // are visible operationally, not just in startup logs.
    private static final String DEV_JWT = "FinTwinSuperSecretJwtKeyForProduction2026SecureKey";
    @Value("${jwt.secret:}")                private String jwtSecret;
    @Value("${encryption.key:}")            private String encryptionKey;
    @Value("${ai.service.internal-key:}")   private String aiInternalKey;
    @Value("${admin.key:}")                 private String adminKey;
    @Value("${ai.service.url:}")            private String aiServiceUrl;
    @Value("${spring.datasource.url:}")     private String datasourceUrl;
    @Value("${redis.url:}")                 private String redisUrl;
    @Value("${cors.allowed-origins:}")      private String corsAllowedOrigins;

    // ── Security posture ──────────────────────────────────────────────────────

    public Map<String, Object> getPosture() {
        LocalDateTime oneHourAgo = LocalDateTime.now().minusHours(1);
        LocalDateTime oneDayAgo  = LocalDateTime.now().minusDays(1);

        long bruteForceIPs      = auditLogRepository.findBruteForceIPs(oneHourAgo, 3).size();
        long targetedAccounts   = auditLogRepository.findTargetedUsers(oneDayAgo, 3).size();
        long suspiciousSessions = auditLogRepository.findSuspiciousSessions(oneDayAgo).size();
        long dataAnomalies      = auditLogRepository.findHighReadVolume(oneDayAgo, 50).size();
        long blockedIPs         = blockedIPRepository.count();
        long usersWithout2FA    = userRepository.count() - userRepository.countByTwoFactorEnabledTrue();
        long failedLoginsToday  = auditLogRepository.countFailedLoginsAfter(
                LocalDateTime.now().withHour(0).withMinute(0).withSecond(0));

        long totalThreats = bruteForceIPs + targetedAccounts + suspiciousSessions + dataAnomalies;

        // Configuration hardening — misconfigurations count toward the posture so a
        // deployment running with dev defaults or plaintext transport can't read
        // "LOW risk" just because no live attack is in progress.
        List<Map<String, String>> configIssues = buildConfigIssues();
        long criticalConfig = configIssues.stream()
                .filter(i -> "CRITICAL".equals(i.get("severity"))).count();

        String riskLevel;
        if (criticalConfig > 0 || totalThreats >= 3)      riskLevel = "HIGH";
        else if (totalThreats > 0 || !configIssues.isEmpty()) riskLevel = "MEDIUM";
        else                                               riskLevel = "LOW";

        Map<String, Object> r = new LinkedHashMap<>();
        r.put("riskLevel", riskLevel);
        r.put("totalActiveThreats", totalThreats);
        r.put("bruteForceIPs", bruteForceIPs);
        r.put("targetedAccounts", targetedAccounts);
        r.put("suspiciousSessions", suspiciousSessions);
        r.put("dataAnomalies", dataAnomalies);
        r.put("blockedIPs", blockedIPs);
        r.put("usersWithout2FA", usersWithout2FA);
        r.put("failedLoginsToday", failedLoginsToday);
        r.put("configIssues", configIssues);
        r.put("configIssueCount", configIssues.size());
        return r;
    }

    /**
     * Inspects security-sensitive runtime config and returns a list of issues,
     * most severe first. Empty when the deployment is hardened. Surfaced under
     * "configIssues" in the posture so the admin dashboard can flag it.
     */
    private List<Map<String, String>> buildConfigIssues() {
        List<Map<String, String>> issues = new ArrayList<>();

        if (jwtSecret == null || jwtSecret.isBlank() || DEV_JWT.equals(jwtSecret))
            issues.add(issue("CRITICAL", "JWT secret", "Using the dev-default JWT signing key — tokens are forgeable. Set JWT_SECRET."));
        if (encryptionKey == null || encryptionKey.isBlank())
            issues.add(issue("CRITICAL", "Field encryption", "FINTWIN_ENCRYPTION_KEY unset — PII is protected only by the weak dev fallback key."));
        if (aiInternalKey == null || aiInternalKey.isBlank())
            issues.add(issue("CRITICAL", "AI service auth", "AI_INTERNAL_KEY unset — the AI service is callable without authentication."));
        if (adminKey == null || adminKey.isBlank())
            issues.add(issue("HIGH", "Admin bootstrap key", "ADMIN_KEY unset — admin bootstrap/migration endpoints are disabled or unprotected."));

        // Transport: internal hops that carry credentials/financial data in the clear.
        if (datasourceUrl != null && !datasourceUrl.isBlank()
                && !datasourceUrl.contains("sslmode=require") && !datasourceUrl.contains("localhost"))
            issues.add(issue("HIGH", "Database TLS", "DB connection has no sslmode=require — traffic to Postgres is unencrypted."));
        if (aiServiceUrl != null && aiServiceUrl.startsWith("http://") && !aiServiceUrl.contains("localhost"))
            issues.add(issue("HIGH", "AI service TLS", "AI_SERVICE_URL is plaintext http:// — the internal key and payloads cross the network unencrypted."));
        if (redisUrl != null && !redisUrl.isBlank()
                && !redisUrl.contains("@") && !redisUrl.contains("localhost"))
            issues.add(issue("MEDIUM", "Redis auth", "REDIS_URL has no password — Redis is reachable unauthenticated on the network."));

        if (corsAllowedOrigins != null && corsAllowedOrigins.contains("localhost"))
            issues.add(issue("MEDIUM", "CORS origins", "CORS still allows localhost — tighten CORS_ALLOWED_ORIGINS for production."));

        return issues;
    }

    private Map<String, String> issue(String severity, String area, String detail) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("severity", severity);
        m.put("area", area);
        m.put("detail", detail);
        return m;
    }

    // ── Brute force ───────────────────────────────────────────────────────────

    public List<Map<String, Object>> getBruteForce(int hours, int threshold) {
        LocalDateTime since = LocalDateTime.now().minusHours(hours);
        return auditLogRepository.findBruteForceIPs(since, threshold).stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ip", r[0]);
            m.put("failedAttempts", r[1]);
            m.put("period", hours + "h");
            m.put("isBlocked", blockedIPRepository.isActivelyBlocked((String) r[0], LocalDateTime.now()));
            return m;
        }).collect(Collectors.toList());
    }

    // ── Account targeting ─────────────────────────────────────────────────────

    public List<Map<String, Object>> getAccountAttacks(int hours, int threshold) {
        LocalDateTime since = LocalDateTime.now().minusHours(hours);
        List<Object[]> rows = auditLogRepository.findTargetedUsers(since, threshold);
        Map<Long, User> users = batchLoadUsers(rows);
        return rows.stream().map(r -> {
            Long userId = ((Number) r[0]).longValue();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("userId", userId);
            m.put("failedAttempts", r[1]);
            m.put("period", hours + "h");
            User u = users.get(userId);
            if (u != null) {
                m.put("email", u.getEmail());
                m.put("fullName", u.getFullName());
                m.put("enabled", u.getEnabled());
            }
            return m;
        }).collect(Collectors.toList());
    }

    // ── Suspicious sessions ───────────────────────────────────────────────────

    public List<Map<String, Object>> getSuspiciousSessions(int hours) {
        LocalDateTime since = LocalDateTime.now().minusHours(hours);
        List<Object[]> rows = auditLogRepository.findSuspiciousSessions(since);
        Map<Long, User> users = batchLoadUsers(rows);
        return rows.stream().map(r -> {
            Long userId = ((Number) r[0]).longValue();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("userId", userId);
            m.put("distinctIPs", r[1]);
            m.put("period", hours + "h");
            User u = users.get(userId);
            if (u != null) {
                m.put("email", u.getEmail());
                m.put("fullName", u.getFullName());
                m.put("lastLoginAt", u.getLastLoginAt());
            }
            return m;
        }).collect(Collectors.toList());
    }

    // ── Data anomalies ────────────────────────────────────────────────────────

    public List<Map<String, Object>> getDataAnomalies(int hours, int threshold) {
        LocalDateTime since = LocalDateTime.now().minusHours(hours);
        List<Object[]> rows = auditLogRepository.findHighReadVolume(since, threshold);
        Map<Long, User> users = batchLoadUsers(rows);
        return rows.stream().map(r -> {
            Long userId = ((Number) r[0]).longValue();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("userId", userId);
            m.put("readCount", r[1]);
            m.put("period", hours + "h");
            User u = users.get(userId);
            if (u != null) {
                m.put("email", u.getEmail());
                m.put("fullName", u.getFullName());
            }
            return m;
        }).collect(Collectors.toList());
    }

    // Batch-loads users for a list of audit rows where row[0] is userId.
    // One DB query regardless of result set size — eliminates N+1.
    private Map<Long, User> batchLoadUsers(List<Object[]> rows) {
        if (rows.isEmpty()) return Collections.emptyMap();
        List<Long> ids = rows.stream()
                .map(r -> ((Number) r[0]).longValue())
                .collect(Collectors.toList());
        return userRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(User::getId, u -> u));
    }

    // ── IP blocklist ──────────────────────────────────────────────────────────

    public List<BlockedIP> listBlockedIPs() {
        return blockedIPRepository.findAll();
    }

    public void blockIP(String ip, String reason, String expiresHours, String blockedByEmail) {
        if (blockedIPRepository.isActivelyBlocked(ip, LocalDateTime.now()))
            throw new IllegalArgumentException("IP is already blocked.");
        BlockedIP block = new BlockedIP();
        block.setIpAddress(ip.trim());
        block.setReason(reason);
        block.setBlockedBy(blockedByEmail);
        if (expiresHours != null && !expiresHours.isBlank()) {
            try { block.setExpiresAt(LocalDateTime.now().plusHours(Long.parseLong(expiresHours))); }
            catch (NumberFormatException ignored) {}
        }
        blockedIPRepository.save(block);
    }

    public boolean unblockIP(String ip) {
        return blockedIPRepository.findByIpAddress(ip).map(b -> {
            blockedIPRepository.delete(b);
            return true;
        }).orElse(false);
    }
}
