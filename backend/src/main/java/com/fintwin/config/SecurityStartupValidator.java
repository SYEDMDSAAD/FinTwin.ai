package com.fintwin.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

@Component
public class SecurityStartupValidator {

    private static final Logger log = LoggerFactory.getLogger(SecurityStartupValidator.class);
    private static final String BORDER =
        "=".repeat(70);
    private static final String DEV_JWT =
        "FinTwinSuperSecretJwtKeyForProduction2026SecureKey";

    private final Environment environment;

    @Value("${jwt.secret}")
    private String jwtSecret;

    @Value("${encryption.key:}")
    private String encryptionKey;

    @Value("${ai.service.internal-key}")
    private String internalKey;

    @Value("${admin.key:}")
    private String adminKey;

    // When true (or when the active profile is "prod"), missing/default secrets
    // abort startup instead of merely warning. Defaults to false for local dev.
    @Value("${app.require-secure-config:false}")
    private boolean requireSecureConfig;

    public SecurityStartupValidator(Environment environment) {
        this.environment = environment;
    }

    @PostConstruct
    public void validate() {
        List<String> problems = new ArrayList<>();

        if (DEV_JWT.equals(jwtSecret)) {
            problems.add("JWT_SECRET is the dev default. Set a random 64-char secret in production.");
        }
        if (encryptionKey == null || encryptionKey.isBlank()) {
            problems.add("FINTWIN_ENCRYPTION_KEY is not set. Dev fallback key is in use — ALL PII IS WEAKLY PROTECTED.");
        }
        if (internalKey == null || internalKey.isBlank()) {
            problems.add("AI_INTERNAL_KEY is not set. Generate with: openssl rand -hex 32");
        }
        if (adminKey == null || adminKey.isBlank()) {
            problems.add("ADMIN_KEY is not set. Admin bootstrap/migration endpoints are unusable until set.");
        }

        if (!problems.isEmpty()) {
            problems.forEach(p -> log.warn("[SECURITY] {}", p));

            if (isSecureConfigRequired()) {
                log.error(BORDER);
                log.error("  STARTUP ABORTED: insecure configuration in a production profile.");
                log.error("  Set the missing env vars above before deploying.");
                log.error(BORDER);
                throw new IllegalStateException(
                        "Refusing to start with dev/default security credentials in a production "
                        + "environment. Offending settings: " + problems);
            }

            log.warn(BORDER);
            log.warn("  SECURITY WARNING: dev credentials detected (see above).");
            log.warn("  Set the missing env vars before deploying to production.");
            log.warn(BORDER);
        }

        log.info("[SECURITY] amount/value columns are AES-256/GCM encrypted (TEXT). " +
                 "If upgrading an existing DB, migrate DOUBLE columns to TEXT before starting.");
    }

    private boolean isSecureConfigRequired() {
        if (requireSecureConfig) return true;
        return Arrays.stream(environment.getActiveProfiles())
                .anyMatch(p -> p.equalsIgnoreCase("prod") || p.equalsIgnoreCase("production"));
    }
}
