package com.fintwin.security;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.Base64;

/**
 * A short-lived pass for the AI service to read ONE user's data through
 * /internal/ai/**, minted by the backend for each copilot request.
 *
 * On App Service the internal API has a public URL, and AI_INTERNAL_KEY alone
 * used to be enough to read any user's transactions by id. The token binds a
 * call to the user being answered and expires after {@link #TTL_SECONDS}, so
 * a leaked internal key reads nothing on its own.
 *
 * It is signed with a key derived from JWT_SECRET, which the AI service never
 * holds: the AI service can pass tokens back, but can't make new ones.
 *
 * Format: {@code <userId>.<expiresEpochSeconds>.<base64url HMAC-SHA256>}
 */
@Component
public class AiToolToken {

    /** Longer than a copilot answer's whole budget (backend waits 90 s). */
    static final long TTL_SECONDS = 300;

    private final byte[] key;
    private final Clock clock;

    @Autowired
    public AiToolToken(@Value("${jwt.secret}") String jwtSecret) {
        this(jwtSecret, Clock.systemUTC());
    }

    AiToolToken(String jwtSecret, Clock clock) {
        // A dedicated key, so a tool token and a login JWT are never interchangeable
        this.key = hmac(jwtSecret.getBytes(StandardCharsets.UTF_8),
                "fintwin-ai-tool-token-v1".getBytes(StandardCharsets.UTF_8));
        this.clock = clock;
    }

    public String mint(Long userId) {
        String payload = userId + "." + (clock.instant().getEpochSecond() + TTL_SECONDS);
        return payload + "." + sign(payload);
    }

    /** True only for an unexpired, untampered token minted for this user. */
    public boolean allows(String token, Long userId) {
        if (token == null || userId == null) return false;
        String[] parts = token.split("\\.");
        if (parts.length != 3) return false;
        String payload = parts[0] + "." + parts[1];
        if (!MessageDigest.isEqual(sign(payload).getBytes(StandardCharsets.UTF_8),
                parts[2].getBytes(StandardCharsets.UTF_8))) return false;
        try {
            return Long.parseLong(parts[0]) == userId
                    && Long.parseLong(parts[1]) > clock.instant().getEpochSecond();
        } catch (NumberFormatException e) {
            return false;
        }
    }

    private String sign(String payload) {
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(hmac(key, payload.getBytes(StandardCharsets.UTF_8)));
    }

    private static byte[] hmac(byte[] key, byte[] data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(data);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
    }
}
