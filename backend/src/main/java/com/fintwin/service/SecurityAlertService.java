package com.fintwin.service;

import com.fintwin.model.User;
import com.fintwin.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Turns the pull-based security posture into a push alert: on a schedule it
 * evaluates {@link SecurityAdminService#getPosture()} and, when the risk level
 * is HIGH, emails every enabled admin.
 *
 * De-duplication: the actionable posture numbers form a signature. The same
 * signature is not re-sent until a cooldown elapses, so a persistent attack
 * produces one alert (plus periodic reminders) rather than one per tick — but a
 * *change* (new threat, escalation) alerts immediately.
 */
@Service
public class SecurityAlertService {

    private static final Logger log = LoggerFactory.getLogger(SecurityAlertService.class);
    private static final List<String> ADMIN_ROLES = List.of("ADMIN", "SUPER_ADMIN");

    private final SecurityAdminService securityAdminService;
    private final EmailService emailService;
    private final UserRepository userRepository;

    @Value("${security.alerts.enabled:true}")
    private boolean enabled;

    // Don't re-send an identical HIGH state more often than this.
    @Value("${security.alerts.cooldown-minutes:360}")
    private long cooldownMinutes;

    private volatile String lastSignature;
    private volatile Instant lastAlertAt;

    public SecurityAlertService(SecurityAdminService securityAdminService,
                                EmailService emailService,
                                UserRepository userRepository) {
        this.securityAdminService = securityAdminService;
        this.emailService = emailService;
        this.userRepository = userRepository;
    }

    // Default: first run 1 min after boot, then every 5 min. Both configurable.
    @Scheduled(initialDelayString = "${security.alerts.initial-delay-ms:60000}",
               fixedDelayString   = "${security.alerts.interval-ms:300000}")
    public void checkAndAlert() {
        if (!enabled) return;
        try {
            Map<String, Object> posture = securityAdminService.getPosture();
            if (!"HIGH".equals(posture.get("riskLevel"))) return;

            String signature = buildSignature(posture);
            Instant now = Instant.now();
            boolean cooldownElapsed = lastAlertAt == null
                    || Duration.between(lastAlertAt, now).toMinutes() >= cooldownMinutes;
            if (signature.equals(lastSignature) && !cooldownElapsed) return;

            // Always log — this is the durable record even if email is off.
            log.warn("[SECURITY ALERT] Risk level HIGH — {}", posture);

            List<User> admins = userRepository.findEnabledByRoleIn(ADMIN_ROLES);
            if (admins.isEmpty()) {
                log.warn("[SECURITY ALERT] No enabled admin to notify.");
            } else if (!emailService.isConfigured()) {
                log.warn("[SECURITY ALERT] Email not configured — {} admin(s) not emailed. "
                        + "Set MAIL_ENABLED=true to receive alerts.", admins.size());
            } else {
                String subject = "[FinTwin] SECURITY ALERT — risk level HIGH";
                String body = buildAlertHtml(posture);
                admins.forEach(a -> emailService.sendSecurityAlert(a.getEmail(), subject, body));
                log.warn("[SECURITY ALERT] Dispatched to {} admin(s).", admins.size());
            }

            // Record state regardless of email config so we don't spin re-logging
            // the same state every tick.
            lastSignature = signature;
            lastAlertAt = now;
        } catch (Exception e) {
            // Never let the scheduler thread die on a transient DB hiccup.
            log.error("[SECURITY ALERT] Posture check failed: {}", e.getMessage());
        }
    }

    private String buildSignature(Map<String, Object> p) {
        return String.join("|",
                str(p.get("riskLevel")),
                str(p.get("bruteForceIPs")),
                str(p.get("targetedAccounts")),
                str(p.get("suspiciousSessions")),
                str(p.get("dataAnomalies")),
                str(p.get("configIssueCount")));
    }

    private String str(Object o) { return o == null ? "0" : o.toString(); }

    private String buildAlertHtml(Map<String, Object> p) {
        String rows = """
                <tr><td style="padding:6px 0;color:rgba(148,163,184,0.7);">Brute-force IPs</td><td style="text-align:right;color:#fff;font-weight:700;">%s</td></tr>
                <tr><td style="padding:6px 0;color:rgba(148,163,184,0.7);">Targeted accounts</td><td style="text-align:right;color:#fff;font-weight:700;">%s</td></tr>
                <tr><td style="padding:6px 0;color:rgba(148,163,184,0.7);">Suspicious sessions</td><td style="text-align:right;color:#fff;font-weight:700;">%s</td></tr>
                <tr><td style="padding:6px 0;color:rgba(148,163,184,0.7);">Data anomalies</td><td style="text-align:right;color:#fff;font-weight:700;">%s</td></tr>
                <tr><td style="padding:6px 0;color:rgba(148,163,184,0.7);">Config issues</td><td style="text-align:right;color:#fff;font-weight:700;">%s</td></tr>
                <tr><td style="padding:6px 0;color:rgba(148,163,184,0.7);">Failed logins today</td><td style="text-align:right;color:#fff;font-weight:700;">%s</td></tr>
                """.formatted(str(p.get("bruteForceIPs")), str(p.get("targetedAccounts")),
                str(p.get("suspiciousSessions")), str(p.get("dataAnomalies")),
                str(p.get("configIssueCount")), str(p.get("failedLoginsToday")));

        return """
            <div style="font-family:'DM Sans',system-ui,sans-serif;background:#080a0f;padding:32px;color:#e2e8f0;max-width:600px;margin:0 auto;border-radius:16px;">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
                <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#f87171,#fb923c);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;">!</div>
                <span style="font-size:16px;font-weight:800;color:#fff;">FinTwin Security Alert</span>
              </div>
              <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:12px;padding:16px 20px;margin-bottom:20px;">
                <div style="font-size:11px;font-weight:700;color:rgba(148,163,184,0.5);letter-spacing:0.08em;margin-bottom:4px;">RISK LEVEL</div>
                <div style="font-size:26px;font-weight:900;color:#f87171;">HIGH</div>
              </div>
              <p style="color:rgba(148,163,184,0.7);margin:0 0 16px;">The automated posture check detected a HIGH-risk security state. Review the admin security dashboard now.</p>
              <table style="width:100%%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">%s</table>
              <p style="color:rgba(148,163,184,0.5);font-size:12px;margin:0;">Open the Admin → Security view for the full breakdown, blocked-IP controls, and per-user detail. This is an automated message; you are receiving it because you hold an admin role.</p>
            </div>
            """.formatted(rows);
    }
}
