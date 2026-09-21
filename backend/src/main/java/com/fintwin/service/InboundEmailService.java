package com.fintwin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fintwin.model.EmailIngestEvent;
import com.fintwin.model.EmailIngestEvent.Status;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.EmailIngestEventRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.util.BankAlertParser;
import com.fintwin.util.BankSenders;
import com.fintwin.util.TransactionMath;
import jakarta.mail.Address;
import jakarta.mail.BodyPart;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Properties;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Turns a bank's alert email, forwarded by the user to their private
 * address, into a transaction — within minutes of the payment, which is what
 * makes the daily view current without an Account Aggregator licence.
 *
 * Three gates stand between an email and the user's ledger:
 *  1. the webhook call is signed with a secret shared only with our mail
 *     worker, and is recent (no replays);
 *  2. the address's random token names exactly one user;
 *  3. the email carries a valid DKIM signature from a bank's own domain,
 *     aligned with its From address — so knowing someone's forwarding address
 *     is not enough to put transactions in their account.
 */
@Service
public class InboundEmailService {

    private static final Logger log = LoggerFactory.getLogger(InboundEmailService.class);
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    static final long MAX_RAW_BYTES = 5L * 1024 * 1024;
    static final long MAX_CLOCK_SKEW_SECONDS = 300;
    public static final String EXTERNAL_ID_PREFIX = "MAIL:";
    public static final String SOURCE_EMAIL = "EMAIL";

    /** What the mail worker should do with the email. */
    public enum Outcome {
        /** Handled — imported, or deliberately dropped. Don't redeliver. */
        ACCEPTED,
        /** The webhook call itself was not ours. */
        UNAUTHORIZED,
        /** Try again later (a DNS lookup for the DKIM key failed). */
        RETRY
    }

    private static final Pattern GMAIL_CODE = Pattern.compile("(?i)confirmation code:?\\s*(\\d{6,12})|\\(#(\\d{6,12})\\)");

    private final UserRepository users;
    private final TransactionRepository transactions;
    private final EmailIngestEventRepository events;
    private final CategoryService categories;
    private final DkimCheck dkim;
    private final CacheManager caches;
    private final Clock clock;
    private final ObjectMapper mapper = new ObjectMapper();

    private final String secret;
    private final String domain;

    @Autowired
    public InboundEmailService(UserRepository users, TransactionRepository transactions,
                               EmailIngestEventRepository events, CategoryService categories,
                               DkimCheck dkim, CacheManager caches,
                               @Value("${inbound.email.secret:}") String secret,
                               @Value("${inbound.email.domain:}") String domain) {
        this(users, transactions, events, categories, dkim, caches, secret, domain, Clock.systemUTC());
    }

    InboundEmailService(UserRepository users, TransactionRepository transactions,
                        EmailIngestEventRepository events, CategoryService categories,
                        DkimCheck dkim, CacheManager caches, String secret, String domain, Clock clock) {
        this.users = users;
        this.transactions = transactions;
        this.events = events;
        this.categories = categories;
        this.dkim = dkim;
        this.caches = caches;
        this.secret = secret == null ? "" : secret;
        this.domain = domain == null ? "" : domain.toLowerCase(Locale.ROOT).trim();
        this.clock = clock;
    }

    public boolean enabled() {
        return !secret.isBlank() && !domain.isBlank();
    }

    public String domain() {
        return domain;
    }

    // ── Webhook ──────────────────────────────────────────────────────────────

    /**
     * @param body      JSON {"recipient": "u-token@domain", "raw": base64 RFC 822 message}
     * @param timestamp unix seconds the worker signed at
     * @param signature hex HMAC-SHA256 of "timestamp.body" under the shared secret
     */
    @Transactional
    public Outcome receive(byte[] body, String timestamp, String signature) {
        if (!enabled() || !signatureValid(body, timestamp, signature)) return Outcome.UNAUTHORIZED;

        String recipient;
        byte[] raw;
        try {
            JsonNode json = mapper.readTree(body);
            recipient = json.path("recipient").asText("");
            raw = Base64.getDecoder().decode(json.path("raw").asText(""));
        } catch (Exception e) {
            log.warn("Inbound email: malformed webhook body");
            return Outcome.ACCEPTED;
        }
        if (raw.length == 0 || raw.length > MAX_RAW_BYTES) return Outcome.ACCEPTED;

        Optional<User> owner = ownerOf(recipient);
        // Unknown or rotated address: drop quietly, never hint which tokens exist
        if (owner.isEmpty()) return Outcome.ACCEPTED;
        User user = owner.get();

        MimeMessage message;
        try {
            message = new MimeMessage(Session.getInstance(new Properties()), new ByteArrayInputStream(raw));
        } catch (Exception e) {
            record(user, null, null, Status.REJECTED, "Unreadable email", null, null);
            return Outcome.ACCEPTED;
        }

        String from = fromAddress(message);
        String fromDomain = BankSenders.domainOf(from);
        DkimCheck.Result signed = dkim.check(raw);
        if (signed.temporaryFailure()) return Outcome.RETRY;
        boolean authentic = fromDomain != null
                && signed.domains().stream().anyMatch(d -> BankSenders.aligned(d, fromDomain));

        if (isGmailConfirmation(from)) {
            return handleGmailConfirmation(user, message, authentic, fromDomain);
        }

        Optional<String> bank = BankSenders.bankFor(fromDomain);
        if (bank.isEmpty()) {
            record(user, fromDomain, null, Status.REJECTED, "Not from a bank we read alerts from", null, null);
            return Outcome.ACCEPTED;
        }
        if (!authentic) {
            // Could be a spoof, or mail altered in transit; either way unsafe to import
            record(user, fromDomain, bank.get(), Status.REJECTED,
                    "Bank signature missing or invalid", null, null);
            return Outcome.ACCEPTED;
        }

        LocalDate received = receivedDate(message);
        Optional<BankAlertParser.Alert> parsed =
                BankAlertParser.parse(subject(message), bodyText(message), received);
        if (parsed.isEmpty()) {
            record(user, fromDomain, bank.get(), Status.UNMATCHED, "No transaction found in this email", null, null);
            return Outcome.ACCEPTED;
        }

        importAlert(user, message, raw, fromDomain, bank.get(), parsed.get());
        return Outcome.ACCEPTED;
    }

    boolean signatureValid(byte[] body, String timestamp, String signature) {
        if (timestamp == null || signature == null) return false;
        long ts;
        try {
            ts = Long.parseLong(timestamp.trim());
        } catch (NumberFormatException e) {
            return false;
        }
        long now = Instant.now(clock).getEpochSecond();
        if (Math.abs(now - ts) > MAX_CLOCK_SKEW_SECONDS) return false;

        byte[] expected = hmac(timestamp.trim() + "." + new String(body, StandardCharsets.UTF_8));
        byte[] given;
        try {
            given = HexFormat.of().parseHex(signature.trim().toLowerCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return false;
        }
        return MessageDigest.isEqual(expected, given);
    }

    byte[] hmac(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("HMAC unavailable", e);
        }
    }

    private Optional<User> ownerOf(String recipient) {
        String address = recipient == null ? "" : recipient.trim().toLowerCase(Locale.ROOT);
        int at = address.lastIndexOf('@');
        if (at < 0 || !address.substring(at + 1).equals(domain)) return Optional.empty();
        String local = address.substring(0, at);
        // Gmail and friends may add "+tag"; the token is what comes before it
        int plus = local.indexOf('+');
        if (plus >= 0) local = local.substring(0, plus);
        if (!local.startsWith("u-") || local.length() < 12) return Optional.empty();
        return users.findByIngestToken(local.substring(2));
    }

    // ── Gmail forwarding confirmation ────────────────────────────────────────

    private static boolean isGmailConfirmation(String from) {
        return from != null && from.toLowerCase(Locale.ROOT).startsWith("forwarding-noreply@google.com");
    }

    /**
     * Gmail won't forward anywhere until the address owner types in a code it
     * mails there. That mail arrives here, so the code is kept for the user
     * to copy into Gmail's settings.
     */
    private Outcome handleGmailConfirmation(User user, MimeMessage message, boolean authentic, String fromDomain) {
        if (!authentic) {
            record(user, fromDomain, null, Status.REJECTED, "Unsigned forwarding confirmation", null, null);
            return Outcome.ACCEPTED;
        }
        Matcher m = GMAIL_CODE.matcher(subject(message) + "\n" + bodyText(message));
        if (m.find()) {
            user.setForwardingCode(m.group(1) != null ? m.group(1) : m.group(2));
            user.setForwardingCodeAt(LocalDateTime.now(clock));
            users.save(user);
            record(user, fromDomain, null, Status.CONFIRMATION, "Gmail forwarding confirmation code received", null, null);
        }
        return Outcome.ACCEPTED;
    }

    // ── Import ───────────────────────────────────────────────────────────────

    private void importAlert(User user, MimeMessage message, byte[] raw, String fromDomain,
                             String bank, BankAlertParser.Alert alert) {
        String accountRef = alert.last4() == null ? bank : bank + " ··" + alert.last4();
        String externalId = EXTERNAL_ID_PREFIX + digest(messageId(message, raw));

        if (transactions.findByUserAndExternalId(user, externalId).isPresent()) {
            record(user, fromDomain, bank, Status.DUPLICATE, "This alert was already imported", accountRef, null);
            return;
        }

        // The same money may already be on record from a statement, a bank
        // link, or a manual entry — the alert must not count it twice
        List<Transaction> nearby = transactions.findSince(user.getId(), alert.date().minusDays(2));
        Optional<Transaction> already = nearby.stream()
                .filter(t -> t.getAmount() != null && t.getDate() != null)
                .filter(t -> Math.abs(t.getAmount() - alert.amount()) < 0.005)
                .filter(t -> Math.abs(t.getDate().toEpochDay() - alert.date().toEpochDay()) <= 1)
                .filter(t -> t.getAccountRef() == null || t.getAccountRef().equals(accountRef))
                .findFirst();
        if (already.isPresent()) {
            record(user, fromDomain, bank, Status.DUPLICATE, "Already on record from another source",
                    accountRef, already.get().getId());
            return;
        }

        String merchant = alert.counterparty() != null ? alert.counterparty()
                : alert.card() ? bank + " card " + (alert.amount() < 0 ? "spend" : "credit")
                : describeChannel(alert);
        boolean cardDataPresent = alert.card() || transactions.countByUserAndSource(user, "CARD") > 0;
        String category = TransactionMath.forcedImportCategory(merchant, alert.amount(), alert.card(), cardDataPresent);
        if (category == null) {
            category = categories.categorize(merchant, categories.learnedRulesFor(user));
            if (category == null) category = "Other";
        }

        Transaction t = new Transaction();
        t.setUser(user);
        t.setDate(alert.date());
        t.setMerchant(merchant);
        t.setAmount(alert.amount());
        t.setCategory(category);
        t.setSource(alert.card() ? "CARD" : SOURCE_EMAIL);
        t.setExternalId(externalId);
        t.setAccountRef(accountRef);
        Transaction saved = transactions.save(t);

        if (alert.card()) {
            // First card purchases on record: bank-side bill payments already
            // imported now duplicate them, exactly as with a card statement
            List<Transaction> restamped = TransactionMath.restampCardBillPayments(transactions.findByUser(user));
            if (!restamped.isEmpty()) transactions.saveAll(restamped);
        }

        record(user, fromDomain, bank, Status.IMPORTED, null, accountRef, saved.getId());
        evictUserCaches(user);
    }

    private static String describeChannel(BankAlertParser.Alert alert) {
        String dir = alert.amount() < 0 ? "payment" : "credit";
        return alert.channel() == null ? "Bank " + dir : alert.channel() + " " + dir;
    }

    private void evictUserCaches(User user) {
        for (String name : List.of("user-insights", "user-score")) {
            Cache cache = caches.getCache(name);
            if (cache != null && user.getEmail() != null) cache.evict(user.getEmail());
        }
    }

    private void record(User user, String senderDomain, String bank, Status status,
                        String detail, String accountRef, Long transactionId) {
        events.save(new EmailIngestEvent(user, LocalDateTime.now(clock), senderDomain, bank,
                status, detail, accountRef, transactionId));
    }

    // ── MIME helpers ─────────────────────────────────────────────────────────

    private static String fromAddress(MimeMessage m) {
        try {
            Address[] from = m.getFrom();
            if (from == null || from.length == 0) return null;
            return from[0] instanceof InternetAddress ia ? ia.getAddress() : from[0].toString();
        } catch (Exception e) {
            return null;
        }
    }

    private static String subject(MimeMessage m) {
        try {
            return m.getSubject() == null ? "" : m.getSubject();
        } catch (Exception e) {
            return "";
        }
    }

    private LocalDate receivedDate(MimeMessage m) {
        try {
            if (m.getSentDate() != null) return m.getSentDate().toInstant().atZone(IST).toLocalDate();
        } catch (Exception ignored) {
            // fall through to now
        }
        return LocalDate.now(clock.withZone(IST));
    }

    private static String messageId(MimeMessage m, byte[] raw) {
        try {
            if (m.getMessageID() != null && !m.getMessageID().isBlank()) return m.getMessageID();
        } catch (Exception ignored) {
            // hash the whole message instead
        }
        return HexFormat.of().formatHex(sha256(raw));
    }

    private static String digest(String s) {
        return HexFormat.of().formatHex(sha256(s.getBytes(StandardCharsets.UTF_8))).substring(0, 40);
    }

    private static byte[] sha256(byte[] data) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(data);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** The readable text of the email: text/plain if there is one, else de-tagged HTML. */
    static String bodyText(Part part) {
        try {
            if (part.isMimeType("text/plain")) return String.valueOf(part.getContent());
            if (part.isMimeType("text/html")) return htmlToText(String.valueOf(part.getContent()));
            if (part.isMimeType("multipart/*")) {
                Multipart mp = (Multipart) part.getContent();
                String html = null;
                for (int i = 0; i < mp.getCount(); i++) {
                    BodyPart bp = mp.getBodyPart(i);
                    if (bp.isMimeType("text/plain")) return String.valueOf(bp.getContent());
                    if (bp.isMimeType("multipart/*")) {
                        String nested = bodyText(bp);
                        if (!nested.isBlank()) return nested;
                    }
                    if (bp.isMimeType("text/html") && html == null) html = htmlToText(String.valueOf(bp.getContent()));
                }
                return html == null ? "" : html;
            }
        } catch (Exception e) {
            log.debug("Could not read email body: {}", e.getMessage());
        }
        return "";
    }

    private static final Map<String, String> ENTITIES = Map.of(
            "&nbsp;", " ", "&amp;", "&", "&lt;", "<", "&gt;", ">", "&quot;", "\"", "&#39;", "'",
            "&#8377;", "₹", "&rupee;", "₹");

    static String htmlToText(String html) {
        String t = html.replaceAll("(?is)<(script|style)[^>]*>.*?</\\1>", " ")
                .replaceAll("(?i)<br\\s*/?>|</p>|</div>|</tr>|</li>", "\n")
                .replaceAll("(?s)<[^>]+>", " ");
        for (Map.Entry<String, String> e : ENTITIES.entrySet()) t = t.replace(e.getKey(), e.getValue());
        return t.replaceAll("[ \\t]+", " ").replaceAll(" *\\n[ \\n]*", "\n").trim();
    }
}
