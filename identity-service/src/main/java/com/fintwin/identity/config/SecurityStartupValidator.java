package com.fintwin.identity.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Refuses to start a production deployment that is still holding dev defaults.
 * The main backend has had this since the security audit; the identity service
 * needed it more, because it is the service that issues tokens and owns the
 * signup and password-reset flows.
 */
@Component
public class SecurityStartupValidator {

    private static final Logger log = LoggerFactory.getLogger(SecurityStartupValidator.class);
    private static final String BORDER = "=".repeat(70);
    private static final String DEV_JWT = "FinTwinSuperSecretJwtKeyForProduction2026SecureKey";

    private final Environment environment;

    @Value("${jwt.secret:}")
    private String jwtSecret;

    @Value("${encryption.key:}")
    private String encryptionKey;

    @Value("${internal.key:}")
    private String internalKey;

    @Value("${mail.enabled:false}")
    private boolean mailEnabled;

    @Value("${spring.mail.username:}")
    private String mailUsername;

    @Value("${app.require-secure-config:false}")
    private boolean requireSecureConfig;

    public SecurityStartupValidator(Environment environment) {
        this.environment = environment;
    }

    @PostConstruct
    public void validate() {
        List<String> problems = new ArrayList<>();

        if (DEV_JWT.equals(jwtSecret) || jwtSecret == null || jwtSecret.isBlank()) {
            problems.add("JWT_SECRET is the dev default. Set a random 64-char secret, the same one the backend uses.");
        }
        if (encryptionKey == null || encryptionKey.isBlank()) {
            problems.add("FINTWIN_ENCRYPTION_KEY is not set. The dev fallback key is in use — stored emails are weakly protected.");
        }
        // A warning, not a blocker: /api/token/introspect fails closed without
        // this key, and nothing calls it today — the backend verifies JWTs with
        // the shared JWT_SECRET instead.
        if (internalKey == null || internalKey.isBlank()) {
            log.warn("[SECURITY] INTERNAL_KEY is not set — /api/token/introspect will reject every call.");
        }
        // Without a mail provider there is no way to deliver a verification OTP
        // or a reset link, and the API falls back to returning them in the
        // response — which in production would let anyone verify, or take over,
        // an address they do not own.
        if (!mailEnabled || mailUsername == null || mailUsername.isBlank()) {
            problems.add("MAIL_ENABLED/MAIL_USERNAME are not set. No signup verification or password-reset mail can be delivered.");
        }

        if (problems.isEmpty()) return;

        problems.forEach(p -> log.warn("[SECURITY] {}", p));

        if (isSecureConfigRequired()) {
            log.error(BORDER);
            log.error("  STARTUP ABORTED: insecure configuration in a production profile.");
            log.error("  Set the missing env vars above before deploying.");
            log.error(BORDER);
            throw new IllegalStateException(
                    "Refusing to start with dev/default configuration in a production environment. "
                    + "Offending settings: " + problems);
        }

        log.warn(BORDER);
        log.warn("  SECURITY WARNING: dev configuration detected (see above).");
        log.warn("  Verification OTPs and reset links are returned in API responses in this mode.");
        log.warn(BORDER);
    }

    private boolean isSecureConfigRequired() {
        if (requireSecureConfig) return true;
        return Arrays.stream(environment.getActiveProfiles())
                .anyMatch(p -> p.equalsIgnoreCase("prod") || p.equalsIgnoreCase("production"));
    }
}
