package com.fintwin.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Deterministic HMAC-SHA256 blind index for the email field.
 *
 * AES-256/GCM (used for the email column) uses a random IV, so the same
 * plaintext encrypts to different ciphertext every time — making
 * WHERE email = ? impossible. This util produces a stable, one-way hash
 * that is stored in the email_hash column and used for all lookups.
 *
 * Uses the same key as EncryptionConverter (encryption.key env var) so
 * no additional secret is required.
 */
@Component
public class EmailHashUtil {

    // Same dev fallback as EncryptionConverter
    private static final String DEV_KEY_B64 = "ZmludHdpbi1kZXYta2V5LTMyLWJ5dGUta2V5LXBhZCE=";

    private static volatile byte[] HMAC_KEY;

    @Value("${encryption.key:}")
    public void init(String keyB64) {
        String k = (keyB64 == null || keyB64.isBlank()) ? DEV_KEY_B64 : keyB64;
        HMAC_KEY = Base64.getDecoder().decode(k);
    }

    public static String hash(String email) {
        if (email == null) return null;
        try {
            byte[] key = HMAC_KEY != null ? HMAC_KEY : Base64.getDecoder().decode(DEV_KEY_B64);
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            byte[] hmac = mac.doFinal(
                    email.toLowerCase().trim().getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hmac);
        } catch (Exception e) {
            throw new RuntimeException("Email hashing failed", e);
        }
    }
}
