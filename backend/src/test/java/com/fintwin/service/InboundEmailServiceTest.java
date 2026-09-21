package com.fintwin.service;

import com.fintwin.model.EmailIngestEvent;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.EmailIngestEventRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.util.TransactionMath;
import org.apache.james.jdkim.DKIMSigner;
import org.apache.james.jdkim.DKIMVerifier;
import org.apache.james.jdkim.exceptions.TempFailException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Real DKIM: each test email is signed with a throwaway RSA key, and the
 * verifier's DNS lookup is replaced by one that serves that key — so the
 * signature checks run exactly as in production, just without the network.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class InboundEmailServiceTest {

    private static final String SECRET = "test-shared-secret";
    private static final String DOMAIN = "in.fintwin.test";
    private static final String TOKEN = "0123456789abcdef0123";
    private static final Instant NOW = Instant.parse("2026-09-21T06:00:00Z");

    @Mock private UserRepository users;
    @Mock private TransactionRepository transactions;
    @Mock private EmailIngestEventRepository events;
    @Mock private CategoryService categories;

    private static final KeyPair BANK_KEY = rsa();
    private static final KeyPair ATTACKER_KEY = rsa();

    private InboundEmailService service;
    private User user;

    private static KeyPair rsa() {
        try {
            KeyPairGenerator g = KeyPairGenerator.getInstance("RSA");
            g.initialize(2048);
            return g.generateKeyPair();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @BeforeEach
    void setUp() {
        // "DNS": every domain publishes the bank key, except attacker.example
        DkimCheck dkim = new DkimCheck(() -> new DKIMVerifier((method, selector, token) -> List.of(
                "v=DKIM1; k=rsa; p=" + Base64.getEncoder().encodeToString(
                        (token.toString().equals("attacker.example") ? ATTACKER_KEY : BANK_KEY)
                                .getPublic().getEncoded()))));

        service = new InboundEmailService(users, transactions, events, categories, dkim,
                new ConcurrentMapCacheManager("user-insights", "user-score"),
                SECRET, DOMAIN, Clock.fixed(NOW, ZoneOffset.UTC));

        user = new User();
        ReflectionTestUtils.setField(user, "id", 7L);
        user.setEmail("saad@example.com");
        user.setIngestToken(TOKEN);
        when(users.findByIngestToken(TOKEN)).thenReturn(Optional.of(user));
        when(transactions.findByUserAndExternalId(any(), anyString())).thenReturn(Optional.empty());
        when(transactions.findSince(any(), any())).thenReturn(List.of());
        when(transactions.save(any(Transaction.class))).thenAnswer(inv -> {
            Transaction t = inv.getArgument(0);
            ReflectionTestUtils.setField(t, "id", 99L);
            return t;
        });
        when(categories.learnedRulesFor(any())).thenReturn(Map.of());
        when(categories.categorize(eq("NETFLIX"), any())).thenReturn("Entertainment");
    }

    // ── builders ─────────────────────────────────────────────────────────────

    private static String email(String from, String subject, String body, String messageId) {
        return "From: " + from + "\r\n"
                + "To: saad@gmail.com\r\n"
                + "Subject: " + subject + "\r\n"
                + "Date: Mon, 21 Sep 2026 11:02:13 +0530\r\n"
                + "Message-ID: <" + messageId + ">\r\n"
                + "MIME-Version: 1.0\r\n"
                + "Content-Type: text/plain; charset=UTF-8\r\n"
                + "\r\n"
                + body + "\r\n";
    }

    private static byte[] signed(String message, String signingDomain, KeyPair key) {
        try {
            String template = "v=1; a=rsa-sha256; c=relaxed/relaxed; d=" + signingDomain
                    + "; s=s1; h=from:to:subject:date:message-id; bh=; b=;";
            String header = new DKIMSigner(template, key.getPrivate())
                    .sign(new ByteArrayInputStream(message.getBytes(StandardCharsets.UTF_8)));
            return (header + "\r\n" + message).getBytes(StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static final String NETFLIX_ALERT = "Dear Customer,\r\n"
            + "Rs.649.00 has been debited from account **1234 to VPA netflix@icici NETFLIX on 21-09-26. "
            + "Your UPI transaction reference number is 426512345678.";

    private InboundEmailService.Outcome deliver(byte[] raw) {
        return deliver(raw, "u-" + TOKEN + "@" + DOMAIN, NOW.getEpochSecond());
    }

    private InboundEmailService.Outcome deliver(byte[] raw, String recipient, long timestamp) {
        String body = "{\"recipient\":\"" + recipient + "\",\"raw\":\""
                + Base64.getEncoder().encodeToString(raw) + "\"}";
        String ts = Long.toString(timestamp);
        String sig = HexFormat.of().formatHex(service.hmac(ts + "." + body));
        return service.receive(body.getBytes(StandardCharsets.UTF_8), ts, sig);
    }

    private EmailIngestEvent lastEvent() {
        ArgumentCaptor<EmailIngestEvent> captor = ArgumentCaptor.forClass(EmailIngestEvent.class);
        verify(events, org.mockito.Mockito.atLeastOnce()).save(captor.capture());
        return captor.getValue();
    }

    private Transaction savedTransaction() {
        ArgumentCaptor<Transaction> captor = ArgumentCaptor.forClass(Transaction.class);
        verify(transactions).save(captor.capture());
        return captor.getValue();
    }

    // ── the happy path ───────────────────────────────────────────────────────

    @Test
    void aSignedBankAlertBecomesATransaction() {
        byte[] raw = signed(email("HDFC Bank InstaAlerts <alerts@hdfcbank.net>",
                "You have done a UPI txn", NETFLIX_ALERT, "a1@hdfcbank.net"), "hdfcbank.net", BANK_KEY);

        assertThat(deliver(raw)).isEqualTo(InboundEmailService.Outcome.ACCEPTED);

        Transaction t = savedTransaction();
        assertThat(t.getAmount()).isEqualTo(-649.0);
        assertThat(t.getMerchant()).isEqualTo("NETFLIX");
        assertThat(t.getCategory()).isEqualTo("Entertainment");
        assertThat(t.getDate()).isEqualTo(LocalDate.of(2026, 9, 21));
        assertThat(t.getSource()).isEqualTo(InboundEmailService.SOURCE_EMAIL);
        assertThat(t.getAccountRef()).isEqualTo("HDFC ··1234");
        assertThat(t.getExternalId()).startsWith(InboundEmailService.EXTERNAL_ID_PREFIX);
        assertThat(lastEvent().getStatus()).isEqualTo(EmailIngestEvent.Status.IMPORTED);
    }

    @Test
    void aCardAlertIsACardTransactionAndStopsBillPaymentsCountingTwice() {
        Transaction oldBill = new Transaction();
        oldBill.setAmount(-12_000.0);
        oldBill.setMerchant("CREDIT CARD PAYMENT HDFC");
        oldBill.setCategory("Other");
        oldBill.setSource("EMAIL");
        when(transactions.findByUser(user)).thenReturn(List.of(oldBill));

        byte[] raw = signed(email("HDFC Bank <alerts@hdfcbank.net>", "Alert : Update on your HDFC Bank Credit Card",
                "Dear Card Member, Thank you for using your HDFC Bank Credit Card ending 5678 for "
                + "Rs 2,499.00 at AMAZON PAY INDIA on 20-09-2026 18:42:10.", "c1@hdfcbank.net"),
                "hdfcbank.net", BANK_KEY);
        deliver(raw);

        Transaction t = savedTransaction();
        assertThat(t.getSource()).isEqualTo("CARD");
        assertThat(t.getAccountRef()).isEqualTo("HDFC ··5678");
        assertThat(oldBill.getCategory()).isEqualTo(TransactionMath.CARD_PAYMENT_CATEGORY);
    }

    @Test
    void htmlOnlyAlertsAreRead() {
        String html = "<html><body><p>Dear Customer,</p><p>Rs.649.00&nbsp;has been debited from account **1234 "
                + "to VPA netflix@icici NETFLIX on 21-09-26.</p><div>Never share your OTP.</div></body></html>";
        String message = email("alerts@hdfcbank.net", "UPI txn", html, "h1@hdfcbank.net")
                .replace("text/plain", "text/html");
        deliver(signed(message, "hdfcbank.net", BANK_KEY));

        assertThat(savedTransaction().getAmount()).isEqualTo(-649.0);
    }

    // ── the three gates ──────────────────────────────────────────────────────

    @Test
    void aWebhookCallWithoutOurSignatureIsRefused() {
        byte[] body = "{\"recipient\":\"x\",\"raw\":\"\"}".getBytes(StandardCharsets.UTF_8);
        String ts = Long.toString(NOW.getEpochSecond());
        assertThat(service.receive(body, ts, "00".repeat(32))).isEqualTo(InboundEmailService.Outcome.UNAUTHORIZED);
        assertThat(service.receive(body, ts, null)).isEqualTo(InboundEmailService.Outcome.UNAUTHORIZED);
        assertThat(service.receive(body, ts, "not-hex")).isEqualTo(InboundEmailService.Outcome.UNAUTHORIZED);
    }

    @Test
    void anOldSignedCallCannotBeReplayed() {
        byte[] raw = signed(email("alerts@hdfcbank.net", "UPI txn", NETFLIX_ALERT, "r1@hdfcbank.net"),
                "hdfcbank.net", BANK_KEY);
        long tenMinutesAgo = NOW.getEpochSecond() - 600;
        assertThat(deliver(raw, "u-" + TOKEN + "@" + DOMAIN, tenMinutesAgo))
                .isEqualTo(InboundEmailService.Outcome.UNAUTHORIZED);
        verify(transactions, never()).save(any());
    }

    @Test
    void mailToAnUnknownAddressIsDroppedQuietly() {
        byte[] raw = signed(email("alerts@hdfcbank.net", "UPI txn", NETFLIX_ALERT, "u1@hdfcbank.net"),
                "hdfcbank.net", BANK_KEY);
        assertThat(deliver(raw, "u-ffffffffffffffffffff@" + DOMAIN, NOW.getEpochSecond()))
                .isEqualTo(InboundEmailService.Outcome.ACCEPTED);
        assertThat(deliver(raw, "u-" + TOKEN + "@other.domain", NOW.getEpochSecond()))
                .isEqualTo(InboundEmailService.Outcome.ACCEPTED);
        verify(transactions, never()).save(any());
        verify(events, never()).save(any());
    }

    @Test
    void anUnsignedAlertIsRejectedEvenFromABankAddress() {
        // Anyone who learns the forwarding address can send this
        byte[] raw = email("alerts@hdfcbank.net", "UPI txn", NETFLIX_ALERT, "s1@x")
                .getBytes(StandardCharsets.UTF_8);
        deliver(raw);

        verify(transactions, never()).save(any());
        assertThat(lastEvent().getStatus()).isEqualTo(EmailIngestEvent.Status.REJECTED);
    }

    @Test
    void aSignatureByAnotherDomainDoesNotVouchForTheBank() {
        byte[] raw = signed(email("alerts@hdfcbank.net", "UPI txn", NETFLIX_ALERT, "s2@x"),
                "attacker.example", ATTACKER_KEY);
        deliver(raw);

        verify(transactions, never()).save(any());
        assertThat(lastEvent().getStatus()).isEqualTo(EmailIngestEvent.Status.REJECTED);
    }

    @Test
    void aSignatureThatNoLongerMatchesTheBodyIsRejected() {
        byte[] raw = signed(email("alerts@hdfcbank.net", "UPI txn", NETFLIX_ALERT, "t1@hdfcbank.net"),
                "hdfcbank.net", BANK_KEY);
        byte[] tampered = new String(raw, StandardCharsets.UTF_8)
                .replace("Rs.649.00", "Rs.64900.00").getBytes(StandardCharsets.UTF_8);
        deliver(tampered);

        verify(transactions, never()).save(any());
        assertThat(lastEvent().getStatus()).isEqualTo(EmailIngestEvent.Status.REJECTED);
    }

    @Test
    void aSignedNonBankSenderIsNotRead() {
        byte[] raw = signed(email("deals@shop.example", "Your order", "Rs 649.00 debited for your order.", "n1@shop"),
                "shop.example", BANK_KEY);
        deliver(raw);

        verify(transactions, never()).save(any());
        assertThat(lastEvent().getDetail()).contains("Not from a bank");
    }

    @Test
    void aDnsHiccupAsksForRedelivery() {
        DkimCheck flaky = new DkimCheck(() -> new DKIMVerifier((m, s, t) -> {
            throw new TempFailException("DNS timeout");
        }));
        service = new InboundEmailService(users, transactions, events, categories, flaky,
                new ConcurrentMapCacheManager(), SECRET, DOMAIN, Clock.fixed(NOW, ZoneOffset.UTC));
        byte[] raw = signed(email("alerts@hdfcbank.net", "UPI txn", NETFLIX_ALERT, "d1@hdfcbank.net"),
                "hdfcbank.net", BANK_KEY);

        assertThat(deliver(raw)).isEqualTo(InboundEmailService.Outcome.RETRY);
        verify(transactions, never()).save(any());
    }

    // ── not a transaction / already have it ──────────────────────────────────

    @Test
    void aSignedOtpEmailIsLoggedAsUnmatchedNotImported() {
        byte[] raw = signed(email("alerts@hdfcbank.net", "OTP for your transaction",
                "Your OTP for the transaction of Rs 649.00 at NETFLIX is 123456.", "o1@hdfcbank.net"),
                "hdfcbank.net", BANK_KEY);
        deliver(raw);

        verify(transactions, never()).save(any());
        assertThat(lastEvent().getStatus()).isEqualTo(EmailIngestEvent.Status.UNMATCHED);
    }

    @Test
    void theSameAlertForwardedTwiceIsImportedOnce() {
        byte[] raw = signed(email("alerts@hdfcbank.net", "UPI txn", NETFLIX_ALERT, "dup@hdfcbank.net"),
                "hdfcbank.net", BANK_KEY);
        when(transactions.findByUserAndExternalId(eq(user), anyString()))
                .thenReturn(Optional.of(new Transaction()));
        deliver(raw);

        verify(transactions, never()).save(any());
        assertThat(lastEvent().getStatus()).isEqualTo(EmailIngestEvent.Status.DUPLICATE);
    }

    @Test
    void moneyAlreadyOnRecordFromAnotherSourceIsNotCountedTwice() {
        Transaction fromStatement = new Transaction();
        fromStatement.setAmount(-649.0);
        fromStatement.setDate(LocalDate.of(2026, 9, 22));      // posted a day later
        fromStatement.setAccountRef("HDFC ··1234");
        when(transactions.findSince(any(), any())).thenReturn(List.of(fromStatement));

        deliver(signed(email("alerts@hdfcbank.net", "UPI txn", NETFLIX_ALERT, "x1@hdfcbank.net"),
                "hdfcbank.net", BANK_KEY));

        verify(transactions, never()).save(any());
        assertThat(lastEvent().getStatus()).isEqualTo(EmailIngestEvent.Status.DUPLICATE);
    }

    // ── Gmail's forwarding confirmation ──────────────────────────────────────

    @Test
    void gmailsConfirmationCodeIsKeptForTheUser() {
        byte[] raw = signed(email("Gmail Team <forwarding-noreply@google.com>",
                "(#612345678) Gmail Forwarding Confirmation - Receive Mail from saad@gmail.com",
                "saad@gmail.com has requested to automatically forward mail to your email address.\r\n"
                + "Confirmation code: 612345678", "g1@google.com"), "google.com", BANK_KEY);
        deliver(raw);

        assertThat(user.getForwardingCode()).isEqualTo("612345678");
        verify(users).save(user);
        assertThat(lastEvent().getStatus()).isEqualTo(EmailIngestEvent.Status.CONFIRMATION);
    }

    @Test
    void anUnsignedConfirmationCannotPlantACode() {
        byte[] raw = email("forwarding-noreply@google.com", "(#111111111) Gmail Forwarding Confirmation",
                "Confirmation code: 111111111", "g2@x").getBytes(StandardCharsets.UTF_8);
        deliver(raw);

        assertThat(user.getForwardingCode()).isNull();
    }

    @Test
    void workerAndBackendAgreeOnTheSignature() {
        // Same vector as ops/email-worker/test/worker.test.mjs
        InboundEmailService s = new InboundEmailService(users, transactions, events, categories,
                new DkimCheck(), new ConcurrentMapCacheManager(), "test-shared-secret", DOMAIN,
                Clock.fixed(Instant.ofEpochSecond(1790000000), ZoneOffset.UTC));
        byte[] body = "{\"recipient\":\"u-x@d\",\"raw\":\"\"}".getBytes(StandardCharsets.UTF_8);

        assertThat(s.signatureValid(body, "1790000000",
                "02ca65938fc52cf5d7c7d8d5979cc5657e17f5d7e65a3ae9fb182843891287ff")).isTrue();
    }

    @Test
    void theFeatureIsOffUntilConfigured() {
        InboundEmailService off = new InboundEmailService(users, transactions, events, categories,
                new DkimCheck(), new ConcurrentMapCacheManager(), "", "", Clock.fixed(NOW, ZoneOffset.UTC));
        assertThat(off.enabled()).isFalse();
        assertThat(off.receive("{}".getBytes(), "1", "00")).isEqualTo(InboundEmailService.Outcome.UNAUTHORIZED);
    }
}
