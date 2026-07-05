package com.fintwin.identity.service;

import com.fintwin.identity.dto.AuthResponse;
import com.fintwin.identity.model.User;
import com.fintwin.identity.repository.UserRepository;
import com.fintwin.identity.security.JwtUtil;
import com.warrenstrange.googleauth.GoogleAuthenticator;
import com.warrenstrange.googleauth.GoogleAuthenticatorKey;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import io.jsonwebtoken.Claims;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

    @Autowired private UserRepository userRepository;
    @Autowired private JwtUtil jwtUtil;
    @Autowired private TokenService tokenService;
    @Autowired private LoginAttemptRecorder loginAttemptRecorder;

    private final GoogleAuthenticator gAuth = new GoogleAuthenticator();
    private static final String BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

    @Transactional
    public Map<String, String> setup(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // A stolen access token must not be able to silently replace the
        // authenticator secret while 2FA is active: the response hands the new
        // secret to the caller, which would lock the real user out of 2FA and
        // let a password-holding attacker pass it. Require an explicit
        // disable (which demands a current TOTP code) first.
        if (Boolean.TRUE.equals(user.getTwoFactorEnabled()))
            throw new IllegalArgumentException(
                    "2FA is already enabled. Disable it with a current code before re-running setup.");

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

    @Transactional
    public void enable(String email, int code) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
        if (user.getTwoFactorSecret() == null)
            throw new RuntimeException("2FA not set up. Call setup first.");
        if (!verifyCode(user.getTwoFactorSecret(), code))
            throw new RuntimeException("Invalid verification code");
        user.setTwoFactorEnabled(true);
        userRepository.save(user);
    }

    @Transactional
    public void disable(String email, int code) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
        if (!Boolean.TRUE.equals(user.getTwoFactorEnabled()))
            throw new RuntimeException("2FA is not enabled");
        if (!verifyCode(user.getTwoFactorSecret(), code))
            throw new RuntimeException("Invalid verification code");
        user.setTwoFactorEnabled(false);
        user.setTwoFactorSecret(null);
        userRepository.save(user);
    }

    public boolean isEnabled(String email) {
        return userRepository.findByEmail(email)
                .map(u -> Boolean.TRUE.equals(u.getTwoFactorEnabled()))
                .orElse(false);
    }

    @Transactional
    public AuthResponse completeTwoFactorLogin(String tempToken, String codeStr) {
        Claims claims = jwtUtil.extractClaims(tempToken);
        if (!"2fa_pending".equals(claims.get("type")))
            throw new IllegalArgumentException("Invalid token type");

        String email = claims.getSubject();
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // Brute-force cap: TOTP failures feed the same lockout as password
        // failures. Without this, the 5-minute temp-token window allowed
        // unlimited guessing bounded only by the IP rate limit.
        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(LocalDateTime.now()))
            throw new SecurityException("Account locked due to too many failed attempts. Try again later.");

        // A user disabled during the 5-min temp-token window must not be able to
        // complete login — mirror the enabled check from the password login path.
        if (!Boolean.TRUE.equals(user.getEnabled()))
            throw new SecurityException("Account has been disabled");

        int code = Integer.parseInt(codeStr.replaceAll("\\s", ""));
        long matchedStep = user.getTwoFactorSecret() == null ? -1
                : matchTotpStep(user.getTwoFactorSecret(), code);
        if (matchedStep < 0) {
            loginAttemptRecorder.recordFailure(user.getId());
            throw new SecurityException("Invalid verification code. Check your authenticator app.");
        }

        // Replay guard (RFC 6238): an accepted code stays valid up to 90s in
        // the ±1-step window — a sniffed code must not work a second time.
        if (user.getTwoFactorLastUsedStep() != null && matchedStep <= user.getTwoFactorLastUsedStep()) {
            loginAttemptRecorder.recordFailure(user.getId());
            throw new SecurityException("Invalid verification code. Check your authenticator app.");
        }

        user.setTwoFactorLastUsedStep(matchedStep);
        user.setFailedLoginAttempts(0);
        user.setLockedUntil(null);
        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);

        String accessToken  = tokenService.issueAccessToken(email);
        String refreshToken = tokenService.issueRefreshToken(user);
        return new AuthResponse(accessToken, refreshToken, user.getEmail(), user.getFullName(), user.getRole());
    }

    public boolean verify(String email, int code) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
        if (user.getTwoFactorSecret() == null) return false;
        return verifyCode(user.getTwoFactorSecret(), code);
    }

    private boolean verifyCode(String secret, int code) {
        return matchTotpStep(secret, code) >= 0;
    }

    /** Returns the matched time-step, or -1 when the code is invalid. */
    private long matchTotpStep(String secret, int code) {
        try {
            byte[] keyBytes = base32Decode(secret);
            long timeStep = System.currentTimeMillis() / 1000L / 30L;
            for (long delta = -1; delta <= 1; delta++) {
                if (computeTotp(keyBytes, timeStep + delta) == code) return timeStep + delta;
            }
            return -1;
        } catch (Exception e) {
            return -1;
        }
    }

    private int computeTotp(byte[] key, long counter) throws Exception {
        byte[] msg = new byte[8];
        for (int i = 7; i >= 0; i--) { msg[i] = (byte) (counter & 0xFF); counter >>= 8; }
        Mac mac = Mac.getInstance("HmacSHA1");
        mac.init(new SecretKeySpec(key, "HmacSHA1"));
        byte[] hash = mac.doFinal(msg);
        int offset = hash[hash.length - 1] & 0x0F;
        int otp = ((hash[offset] & 0x7F) << 24) | ((hash[offset + 1] & 0xFF) << 16)
                | ((hash[offset + 2] & 0xFF) << 8) | (hash[offset + 3] & 0xFF);
        return otp % 1_000_000;
    }

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
            if (bitsLeft >= 8) { output[idx++] = (byte) (buffer >> (bitsLeft - 8)); bitsLeft -= 8; }
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
