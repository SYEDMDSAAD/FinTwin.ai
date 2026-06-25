package com.fintwin.identity.security;

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
    private static final AtomicBoolean LEGACY_WARN_EMITTED = new AtomicBoolean(false);

    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_IV_LENGTH = 12;
    private static final int GCM_TAG_LENGTH = 128;

    private static final String DEV_KEY_B64 = "ZmludHdpbi1kZXYta2V5LTMyLWJ5dGUta2V5LXBhZCE=";

    @Value("${encryption.key:}")
    private String encryptionKeyB64;

    private static volatile SecretKey ACTIVE_KEY;

    @PostConstruct
    private void init() {
        String keyB64 = encryptionKeyB64;
        if (keyB64 == null || keyB64.isBlank()) {
            log.warn("FINTWIN_ENCRYPTION_KEY is not set — using dev fallback key.");
            keyB64 = DEV_KEY_B64;
        }
        byte[] keyBytes = Base64.getDecoder().decode(keyB64);
        if (keyBytes.length != 32) {
            throw new IllegalStateException(
                "FINTWIN_ENCRYPTION_KEY must decode to exactly 32 bytes. Got " + keyBytes.length);
        }
        ACTIVE_KEY = new SecretKeySpec(keyBytes, "AES");
        log.info("EncryptionConverter initialized with AES-256/GCM.");
    }

    private SecretKey getKey() {
        if (ACTIVE_KEY == null) {
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
            new SecureRandom().nextBytes(iv);
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, getKey(), new GCMParameterSpec(GCM_TAG_LENGTH, iv));
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
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
            if (combined.length <= GCM_IV_LENGTH) return stored;
            byte[] iv = new byte[GCM_IV_LENGTH];
            byte[] ciphertext = new byte[combined.length - GCM_IV_LENGTH];
            System.arraycopy(combined, 0, iv, 0, GCM_IV_LENGTH);
            System.arraycopy(combined, GCM_IV_LENGTH, ciphertext, 0, ciphertext.length);
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.DECRYPT_MODE, getKey(), new GCMParameterSpec(GCM_TAG_LENGTH, iv));
            byte[] plaintext = cipher.doFinal(ciphertext);
            return new String(plaintext, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return stored;
        } catch (Exception e) {
            if (LEGACY_WARN_EMITTED.compareAndSet(false, true)) {
                log.warn("Legacy unencrypted data detected in DB.");
            } else {
                log.debug("Field decryption failed — legacy plain-text value returned as-is.");
            }
            return stored;
        }
    }
}
