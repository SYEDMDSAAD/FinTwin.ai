package com.fintwin.service;

import com.fintwin.dto.AuthResponse;
import com.fintwin.model.User;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.JwtUtil;
import com.warrenstrange.googleauth.GoogleAuthenticator;
import com.warrenstrange.googleauth.GoogleAuthenticatorKey;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import io.jsonwebtoken.Claims;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayOutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

@Service
public class TwoFactorService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtUtil jwtUtil;

    private final GoogleAuthenticator gAuth = new GoogleAuthenticator();

    // Base32 alphabet — A-Z then 2-7 (RFC 4648)
    private static final String BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

    public Map<String, String> setup(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

        GoogleAuthenticatorKey key = gAuth.createCredentials();
        String secret = key.getKey();

        user.setTwoFactorSecret(secret);
        userRepository.save(user);

        String encodedEmail = URLEncoder.encode(email, StandardCharsets.UTF_8);
        String uri = "otpauth://totp/FinTwin%20AI:" + encodedEmail
                + "?secret=" + secret + "&issuer=FinTwin%20AI";

        Map<String, String> result = new HashMap<>();
        result.put("secret", secret);
        result.put("qrCodeBase64", generateQRCodeBase64(uri));
        return result;
    }

    public void enable(String email, int code) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (user.getTwoFactorSecret() == null) {
            throw new RuntimeException("2FA not set up. Call setup first.");
        }
        if (!verifyCode(user.getTwoFactorSecret(), code)) {
            throw new RuntimeException("Invalid verification code");
        }
        user.setTwoFactorEnabled(true);
        userRepository.save(user);
    }

    public void disable(String email, int code) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (!Boolean.TRUE.equals(user.getTwoFactorEnabled())) {
            throw new RuntimeException("2FA is not enabled");
        }
        if (!verifyCode(user.getTwoFactorSecret(), code)) {
            throw new RuntimeException("Invalid verification code");
        }
        user.setTwoFactorEnabled(false);
        user.setTwoFactorSecret(null);
        userRepository.save(user);
    }

    public boolean isEnabled(String email) {
        return userRepository.findByEmail(email)
                .map(u -> Boolean.TRUE.equals(u.getTwoFactorEnabled()))
                .orElse(false);
    }

    public Map<String, Object> getDebugInfo(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
        String secret = user.getTwoFactorSecret();
        if (secret == null) return Map.of("secret", "NOT SET", "enabled", false);
        try {
            byte[] key = base32Decode(secret);
            long timeStep = System.currentTimeMillis() / 1000L / 30L;
            int expected  = computeTotp(key, timeStep);
            long secsLeft = 30 - (System.currentTimeMillis() / 1000L % 30);
            return Map.of(
                    "secret", secret,
                    "expectedCode", String.format("%06d", expected),
                    "secondsRemaining", secsLeft,
                    "enabled", Boolean.TRUE.equals(user.getTwoFactorEnabled())
            );
        } catch (Exception e) {
            throw new RuntimeException("Debug info failed: " + e.getMessage());
        }
    }

    public AuthResponse completeTwoFactorLogin(String tempToken, String codeStr) {
        Claims claims = jwtUtil.extractClaims(tempToken);
        if (!"2fa_pending".equals(claims.get("type")))
            throw new IllegalArgumentException("Invalid token type");
        String email = claims.getSubject();
        int code = Integer.parseInt(codeStr.replaceAll("\\s", ""));
        if (!verify(email, code))
            throw new SecurityException("Invalid verification code. Check your authenticator app.");
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);
        String realToken = jwtUtil.generateToken(email);
        return new AuthResponse(realToken, user.getEmail(), user.getFullName(), user.getRole());
    }

    public boolean verify(String email, int code) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (user.getTwoFactorSecret() == null) return false;
        return verifyCode(user.getTwoFactorSecret(), code);
    }

    // Pure-Java RFC 6238 TOTP verification — no external library needed for this path.
    // Checks the current 30-second window plus ±1 window to tolerate clock drift.
    private boolean verifyCode(String secret, int code) {
        try {
            byte[] keyBytes = base32Decode(secret);
            long timeStep = System.currentTimeMillis() / 1000L / 30L;
            for (long delta = -1; delta <= 1; delta++) {
                if (computeTotp(keyBytes, timeStep + delta) == code) {
                    return true;
                }
            }
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    private int computeTotp(byte[] key, long counter) throws Exception {
        // Encode counter as 8 bytes big-endian
        byte[] msg = new byte[8];
        for (int i = 7; i >= 0; i--) {
            msg[i] = (byte) (counter & 0xFF);
            counter >>= 8;
        }
        // HMAC-SHA1
        Mac mac = Mac.getInstance("HmacSHA1");
        mac.init(new SecretKeySpec(key, "HmacSHA1"));
        byte[] hash = mac.doFinal(msg);
        // Dynamic truncation (RFC 4226 §5.3)
        int offset = hash[hash.length - 1] & 0x0F;
        int otp = ((hash[offset]     & 0x7F) << 24)
                | ((hash[offset + 1] & 0xFF) << 16)
                | ((hash[offset + 2] & 0xFF) << 8)
                | ((hash[offset + 3] & 0xFF));
        return otp % 1_000_000;
    }

    // Minimal Base32 decoder — handles uppercase A-Z + 2-7, strips padding/whitespace
    private static byte[] base32Decode(String encoded) {
        encoded = encoded.toUpperCase().replaceAll("[^A-Z2-7]", "");
        int outputLen = encoded.length() * 5 / 8;
        byte[] output = new byte[outputLen];
        int buffer = 0, bitsLeft = 0, idx = 0;
        for (char c : encoded.toCharArray()) {
            int val = BASE32.indexOf(c);
            if (val < 0) continue;
            buffer = (buffer << 5) | val;
            bitsLeft += 5;
            if (bitsLeft >= 8) {
                output[idx++] = (byte) (buffer >> (bitsLeft - 8));
                bitsLeft -= 8;
            }
        }
        return output;
    }

    private String generateQRCodeBase64(String uri) {
        try {
            QRCodeWriter writer = new QRCodeWriter();
            BitMatrix matrix = writer.encode(uri, BarcodeFormat.QR_CODE, 200, 200);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(matrix, "PNG", baos);
            return Base64.getEncoder().encodeToString(baos.toByteArray());
        } catch (Exception e) {
            throw new RuntimeException("QR generation failed: " + e.getMessage());
        }
    }
}
