package com.fintwin.security;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicBoolean;

@Component
@Converter
public class EncryptionConverter implements AttributeConverter<String, String> {

    private static final Logger log = LoggerFactory.getLogger(EncryptionConverter.class);

    // Emit only one WARN for the entire JVM lifetime — avoids flooding logs when
    // many rows pre-date encryption. All subsequent failures are logged at DEBUG.
    private static final AtomicBoolean LEGACY_WARN_EMITTED = new AtomicBoolean(false);

    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_IV_LENGTH = 12;
    private static final int GCM_TAG_LENGTH = 128;

    // Thread-safe; reuse one instance instead of allocating per encrypt call.
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    // "fintwin-dev-key-32-byte-key-pad!" — 32 bytes, dev only
    private static final String DEV_KEY_B64 = "ZmludHdpbi1kZXYta2V5LTMyLWJ5dGUta2V5LXBhZCE=";

    @Value("${encryption.key:}")
    private String encryptionKeyB64;

    // Static so Hibernate-managed instances (not Spring-managed) still work
    private static volatile SecretKey ACTIVE_KEY;

    @PostConstruct
    private void init() {
        String keyB64 = encryptionKeyB64;
        if (keyB64 == null || keyB64.isBlank()) {
            log.warn("FINTWIN_ENCRYPTION_KEY is not set — using dev fallback key. "
                    + "DO NOT deploy without setting this environment variable.");
            keyB64 = DEV_KEY_B64;
        }
        byte[] keyBytes = Base64.getDecoder().decode(keyB64);
        if (keyBytes.length != 32) {
            throw new IllegalStateException(
                    "FINTWIN_ENCRYPTION_KEY must decode to exactly 32 bytes (256-bit AES key). "
                    + "Got " + keyBytes.length + " bytes."
            );
        }
        ACTIVE_KEY = new SecretKeySpec(keyBytes, "AES");
        log.info("EncryptionConverter initialized with AES-256/GCM.");
    }

    private SecretKey getKey() {
        if (ACTIVE_KEY == null) {
            // Fallback for Hibernate-managed instances before Spring init
            byte[] keyBytes = Base64.getDecoder().decode(DEV_KEY_B64);
            return new SecretKeySpec(keyBytes, "AES");
        }
        return ACTIVE_KEY;
    }

    @Override
    public String convertToDatabaseColumn(String plaintext) {
        if (plaintext == null) return null;
        try {
            byte[] iv = new byte[GCM_IV_LENGTH];
            SECURE_RANDOM.nextBytes(iv);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, getKey(),
                    new GCMParameterSpec(GCM_TAG_LENGTH, iv));

            byte[] ciphertext = cipher.doFinal(
                    plaintext.getBytes(StandardCharsets.UTF_8));

            // Prepend IV to ciphertext, Base64-encode the result
            byte[] combined = new byte[iv.length + ciphertext.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);

            return Base64.getEncoder().encodeToString(combined);

        } catch (Exception e) {
            throw new RuntimeException("Field encryption failed", e);
        }
    }

    @Override
    public String convertToEntityAttribute(String stored) {
        if (stored == null) return null;
        try {
            byte[] combined = Base64.getDecoder().decode(stored);

            if (combined.length <= GCM_IV_LENGTH) {
                // Too short to be valid ciphertext — return as-is (legacy plaintext)
                return stored;
            }

            byte[] iv = new byte[GCM_IV_LENGTH];
            byte[] ciphertext = new byte[combined.length - GCM_IV_LENGTH];
            System.arraycopy(combined, 0, iv, 0, GCM_IV_LENGTH);
            System.arraycopy(combined, GCM_IV_LENGTH, ciphertext, 0, ciphertext.length);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.DECRYPT_MODE, getKey(),
                    new GCMParameterSpec(GCM_TAG_LENGTH, iv));

            byte[] plaintext = cipher.doFinal(ciphertext);
            return new String(plaintext, StandardCharsets.UTF_8);

        } catch (IllegalArgumentException e) {
            // Not valid Base64 — definitely plain-text legacy data; return silently.
            return stored;
        } catch (Exception e) {
            // Decryption failed on what looked like encrypted data (legacy plain-text
            // that happens to be valid Base64). Warn once; subsequent hits are DEBUG.
            if (LEGACY_WARN_EMITTED.compareAndSet(false, true)) {
                log.warn("Legacy unencrypted data detected in DB. Run POST /admin/migrate-encryption "
                        + "once to re-encrypt all rows. Further per-row failures logged at DEBUG.");
            } else {
                log.debug("Field decryption failed — legacy plain-text value returned as-is.");
            }
            return stored;
        }
    }
}
