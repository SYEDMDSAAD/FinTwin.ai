package com.fintwin.service;

import com.fintwin.exception.NotFoundException;
import com.fintwin.model.EmailIngestEvent;
import com.fintwin.model.User;
import com.fintwin.repository.EmailIngestEventRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The user's side of alert forwarding: their private address, Gmail's
 * confirmation code once it arrives, and what recent alerts turned into.
 */
@Service
public class EmailAlertSettingsService {

    // A confirmation code is only useful while Gmail is waiting for it
    private static final int CODE_SHOWN_FOR_DAYS = 7;

    private final UserRepository users;
    private final EmailIngestEventRepository events;
    private final InboundEmailService inbound;
    private final SecureRandom random = new SecureRandom();

    public EmailAlertSettingsService(UserRepository users, EmailIngestEventRepository events,
                                     InboundEmailService inbound) {
        this.users = users;
        this.events = events;
        this.inbound = inbound;
    }

    @PreAuthorize("hasAuthority('READ_OWN_PROFILE')")
    @Transactional
    public Map<String, Object> status() {
        User user = currentUser();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("enabled", inbound.enabled());
        if (!inbound.enabled()) return out;

        if (user.getIngestToken() == null) {
            user.setIngestToken(newToken());
            users.save(user);
        }
        out.put("address", "u-" + user.getIngestToken() + "@" + inbound.domain());

        boolean codeFresh = user.getForwardingCode() != null && user.getForwardingCodeAt() != null
                && user.getForwardingCodeAt().isAfter(LocalDateTime.now().minusDays(CODE_SHOWN_FOR_DAYS));
        out.put("confirmationCode", codeFresh ? user.getForwardingCode() : null);
        out.put("confirmationAt", codeFresh ? user.getForwardingCodeAt() : null);

        List<Map<String, Object>> recent = events.findTop20ByUserOrderByReceivedAtDesc(user).stream()
                .map(EmailAlertSettingsService::toView).toList();
        out.put("recent", recent);
        return out;
    }

    /**
     * A fresh address, for when the old one was shared or leaked. Mail to the
     * old one is dropped from now on, so Gmail forwarding must be set up again.
     */
    @PreAuthorize("hasAuthority('READ_OWN_PROFILE')")
    @Transactional
    public Map<String, Object> rotate() {
        User user = currentUser();
        user.setIngestToken(newToken());
        user.setForwardingCode(null);
        user.setForwardingCodeAt(null);
        users.save(user);
        return status();
    }

    private static Map<String, Object> toView(EmailIngestEvent e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("receivedAt", e.getReceivedAt());
        m.put("bank", e.getBank());
        m.put("status", e.getStatus().name());
        m.put("detail", e.getDetail());
        m.put("account", e.getAccountRef());
        return m;
    }

    private String newToken() {
        byte[] bytes = new byte[10];
        random.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);          // 80 bits: not guessable
    }

    private User currentUser() {
        return users.findByEmail(SecurityUtils.getCurrentUserEmail())
                .orElseThrow(() -> new NotFoundException("User not found"));
    }
}
