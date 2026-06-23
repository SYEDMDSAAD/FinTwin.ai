package com.fintwin.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class SecurityStartupValidator {

    private static final Logger log = LoggerFactory.getLogger(SecurityStartupValidator.class);
    private static final String BORDER =
        "=".repeat(70);
    private static final String DEV_JWT =
        "FinTwinSuperSecretJwtKeyForProduction2026SecureKey";

    @Value("${jwt.secret}")
    private String jwtSecret;

    @Value("${encryption.key:}")
    private String encryptionKey;

    @Value("${ai.service.internal-key}")
    private String internalKey;

    @PostConstruct
    public void validate() {
        boolean hasWarnings = false;

        if (DEV_JWT.equals(jwtSecret)) {
            warn("JWT_SECRET is the dev default. Set a random 64-char secret in production.");
            hasWarnings = true;
        }
        if (encryptionKey == null || encryptionKey.isBlank()) {
            warn("FINTWIN_ENCRYPTION_KEY is not set. Dev fallback key is in use — ALL PII IS WEAKLY PROTECTED.");
            hasWarnings = true;
        }
        if (internalKey == null || internalKey.isBlank()) {
            warn("AI_INTERNAL_KEY is not set. Generate with: openssl rand -hex 32");
            hasWarnings = true;
        }

        if (hasWarnings) {
            log.warn(BORDER);
            log.warn("  SECURITY WARNING: dev credentials detected (see above).");
            log.warn("  Set the missing env vars before deploying to production.");
            log.warn(BORDER);
        }

        log.info("[SECURITY] amount/value columns are AES-256/GCM encrypted (TEXT). " +
                 "If upgrading an existing DB, migrate DOUBLE columns to TEXT before starting.");
    }

    private void warn(String msg) {
        log.warn("[SECURITY] {}", msg);
    }
}
