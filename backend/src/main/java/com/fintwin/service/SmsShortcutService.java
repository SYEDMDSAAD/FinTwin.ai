package com.fintwin.service;

import com.fintwin.exception.BadRequestException;
import com.fintwin.exception.NotFoundException;
import com.fintwin.exception.UnauthorizedException;
import com.fintwin.model.User;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Bank SMS from an iPhone. iOS doesn't let apps read messages, but a Shortcuts
 * automation can pass on each message that arrives, one at a time, to this
 * service. It signs in with the user's personal import key instead of a login,
 * because a Shortcut runs unattended for months.
 *
 * <p>The key is "ft1.&lt;user id&gt;.&lt;signature&gt;": an HMAC over the user's
 * private ingest token, so nothing new is stored and a new token (the same one
 * behind the email-alert address) revokes every key made from the old one.
 * The key can only add bank alerts to that account, never read anything.
 */
@Service
public class SmsShortcutService {

    private static final Pattern KEY = Pattern.compile("ft1\\.(\\d{1,18})\\.([A-Za-z0-9_-]{43})");

    private final UserRepository users;
    private final SmsImportService sms;
    private final byte[] secret;
    private final SecureRandom random = new SecureRandom();

    public SmsShortcutService(UserRepository users, SmsImportService sms, @Value("${jwt.secret}") String jwtSecret) {
        this.users = users;
        this.sms = sms;
        this.secret = ("sms-shortcut:" + jwtSecret).getBytes(StandardCharsets.UTF_8);
    }

    /** The signed-in user's key, making their ingest token on first use. */
    @PreAuthorize("hasAuthority('WRITE_OWN_TRANSACTIONS')")
    @Transactional
    public String key() {
        User user = currentUser();
        if (user.getIngestToken() == null) {
            user.setIngestToken(newToken());
            users.save(user);
        }
        return keyFor(user);
    }

    /** A new key; the old one, and the old email-alert address, stop working. */
    @PreAuthorize("hasAuthority('WRITE_OWN_TRANSACTIONS')")
    @Transactional
    public String rotate() {
        User user = currentUser();
        user.setIngestToken(newToken());
        user.setForwardingCode(null);
        user.setForwardingCodeAt(null);
        users.save(user);
        return keyFor(user);
    }

    /** One message from the Shortcut. A bad or revoked key is a 401. */
    @Transactional
    public SmsImportService.Result importOne(String key, String sender, String message, Long receivedAt) {
        User user = userFor(key).orElseThrow(() -> new UnauthorizedException("Unknown key"));
        if (message == null || message.isBlank()) {
            throw new BadRequestException("No message");
        }
        boolean known = receivedAt != null && receivedAt > 0 && receivedAt <= System.currentTimeMillis() + 60_000;
        long at = known ? receivedAt : System.currentTimeMillis();
        String from = sender == null ? null : sender.trim();
        return sms.importFor(user, List.of(new SmsImportService.Sms(from, message, at, !known)), true);
    }

    Optional<User> userFor(String key) {
        if (key == null) return Optional.empty();
        Matcher m = KEY.matcher(key.trim());
        if (!m.matches()) return Optional.empty();
        long id;
        try { id = Long.parseLong(m.group(1)); } catch (NumberFormatException e) { return Optional.empty(); }
        return users.findById(id)
                .filter(u -> u.getIngestToken() != null && Boolean.TRUE.equals(u.getEnabled())
                        && !"DEMO".equalsIgnoreCase(u.getRole()))
                .filter(u -> MessageDigest.isEqual(
                        signature(u).getBytes(StandardCharsets.US_ASCII), m.group(2).getBytes(StandardCharsets.US_ASCII)));
    }

    String keyFor(User user) {
        return "ft1." + user.getId() + "." + signature(user);
    }

    private String signature(User user) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            byte[] sig = mac.doFinal((user.getId() + ":" + user.getIngestToken()).getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(sig);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private String newToken() {
        byte[] bytes = new byte[10];
        random.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    private User currentUser() {
        return users.findByEmail(SecurityUtils.getCurrentUserEmail())
                .orElseThrow(() -> new NotFoundException("User not found"));
    }
}
