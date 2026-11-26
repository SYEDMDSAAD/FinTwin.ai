package com.fintwin.service;

import com.fintwin.model.User;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import com.fintwin.util.BankAlertParser;
import com.fintwin.util.SmsSenders;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Bank SMS read on the user's own Android phone, turned into transactions.
 *
 * The phone sends only messages from registered (DLT) senders that mention
 * an amount; here the sender must be a known bank and the text a completed
 * transaction (BankAlertParser refuses OTPs, reminders, balances, failed
 * payments). Message text is parsed and dropped: it is never stored or
 * logged, only the transaction it describes.
 */
@Service
public class SmsImportService {

    public static final String EXTERNAL_ID_PREFIX = "SMS:";
    public static final String SOURCE_SMS = "SMS";
    static final int MAX_MESSAGES = 500;
    static final int MAX_BODY = 2000;
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    // SBI writes "debited by 250.0" with no Rs or INR; the parser needs the currency
    private static final Pattern BARE_AMOUNT = Pattern.compile(
            "(?i)\\b(debited|credited)\\s+(by|for|with)\\s+(?=[0-9])");

    /** One message as the phone read it. */
    public record Sms(String sender, String body, Long receivedAt) {}

    /**
     * @param notBank        not from a bank we know (sender codes worth adding are in unknownSenders)
     * @param notTransaction from a bank, but not a completed transaction (OTP, balance, reminder…)
     */
    public record Result(int imported, int duplicates, int onRecord, int notBank, int notTransaction,
                         Set<String> unknownSenders) {}

    private final UserRepository users;
    private final AlertImporter importer;

    public SmsImportService(UserRepository users, AlertImporter importer) {
        this.users = users;
        this.importer = importer;
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_TRANSACTIONS')")
    @Transactional
    public Result importMessages(List<Sms> messages) {
        if (messages == null || messages.isEmpty()) return new Result(0, 0, 0, 0, 0, Set.of());
        if (messages.size() > MAX_MESSAGES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At most " + MAX_MESSAGES + " messages at a time");
        }
        User user = users.findByEmail(SecurityUtils.getCurrentUserEmail())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        return importFor(user, messages);
    }

    Result importFor(User user, List<Sms> messages) {
        int imported = 0, duplicates = 0, onRecord = 0, notBank = 0, notTransaction = 0;
        Set<String> unknown = new LinkedHashSet<>();

        for (Sms sms : messages) {
            if (sms == null || sms.body() == null || sms.receivedAt() == null) { notTransaction++; continue; }
            Optional<String> bank = SmsSenders.bankFor(sms.sender());
            if (bank.isEmpty()) {
                notBank++;
                String code = SmsSenders.code(sms.sender());
                if (code != null && unknown.size() < 10) unknown.add(code);
                continue;
            }
            String body = sms.body().length() > MAX_BODY ? sms.body().substring(0, MAX_BODY) : sms.body();
            body = BARE_AMOUNT.matcher(body).replaceAll("$1 $2 Rs ");
            LocalDate received = Instant.ofEpochMilli(sms.receivedAt()).atZone(IST).toLocalDate();
            Optional<BankAlertParser.Alert> alert = BankAlertParser.parse("", body, received);
            if (alert.isEmpty()) { notTransaction++; continue; }

            String externalId = EXTERNAL_ID_PREFIX
                    + digest(SmsSenders.code(sms.sender()) + "|" + sms.receivedAt() + "|" + body);
            switch (importer.importAlert(user, bank.get(), alert.get(), externalId, SOURCE_SMS).status()) {
                case IMPORTED -> imported++;
                case DUPLICATE -> duplicates++;
                case ON_RECORD -> onRecord++;
            }
        }
        if (imported > 0) importer.evictUserCaches(user);
        return new Result(imported, duplicates, onRecord, notBank, notTransaction, unknown);
    }

    private static String digest(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(d).substring(0, 40);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
