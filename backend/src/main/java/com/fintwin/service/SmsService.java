package com.fintwin.service;

import com.fintwin.config.FinTwinMetrics;
import com.fintwin.config.HttpClients;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * SMS notifications via MSG91 Flow API.
 *
 * Set SMS_ENABLED=true + SMS_API_KEY + template IDs to activate.
 * When disabled (default), all methods are no-ops — no exception is thrown.
 *
 * MSG91 Flow API: POST https://api.msg91.com/api/v5/flow/
 * Indian numbers must be sent as 91XXXXXXXXXX (country code without +).
 */
@Service
public class SmsService {

    private static final Logger log = LoggerFactory.getLogger(SmsService.class);
    private static final String MSG91_FLOW_URL = "https://api.msg91.com/api/v5/flow/";

    @Value("${sms.enabled:false}")
    private boolean smsEnabled;

    @Value("${sms.provider.api-key:}")
    private String apiKey;

    @Value("${sms.provider.sender-id:FTWIN}")
    private String senderId;

    @Value("${sms.provider.otp-template-id:}")
    private String otpTemplateId;

    @Value("${sms.provider.alert-template-id:}")
    private String alertTemplateId;

    @Autowired
    private FinTwinMetrics metrics;

    private final RestTemplate restTemplate = HttpClients.externalApi();

    public boolean isConfigured() {
        return smsEnabled && apiKey != null && !apiKey.isBlank();
    }

    // ── OTP ──────────────────────────────────────────────────────────────────

    /**
     * Sends a 6-digit OTP for phone verification.
     * Template must contain {{OTP}} variable.
     *
     * @param phone E.164 format (e.g. "+919876543210") or 10-digit Indian number
     * @param otp   plaintext OTP (never persisted — only sent and then SHA-256 hashed for storage)
     */
    public void sendOtp(String phone, String otp) {
        if (!smsEnabled || phone == null || phone.isBlank()) return;

        Map<String, Object> recipient = new HashMap<>();
        recipient.put("mobiles", normalise(phone));
        recipient.put("OTP", otp);

        Map<String, Object> body = new HashMap<>();
        body.put("flow_id",    otpTemplateId);
        body.put("sender",     senderId);
        body.put("recipients", List.of(recipient));

        send(body, "OTP to " + maskPhone(phone));
    }

    // ── Transaction alert ─────────────────────────────────────────────────────

    /**
     * Sends a debit/credit alert after a transaction is recorded.
     * Template must contain {{AMOUNT}} and {{MERCHANT}} variables.
     *
     * Only fires when |amount| >= minimumAlertAmount (₹100 by default).
     */
    public void sendTransactionAlert(String phone, double amount, String merchant) {
        if (!smsEnabled || phone == null || phone.isBlank()) return;
        if (Math.abs(amount) < 100) return;

        String type = amount < 0 ? "debited" : "credited";

        Map<String, Object> recipient = new HashMap<>();
        recipient.put("mobiles", normalise(phone));
        recipient.put("AMOUNT",   String.format("%.0f", Math.abs(amount)));
        recipient.put("MERCHANT", merchant != null ? merchant : "Unknown");
        recipient.put("TYPE",     type);

        Map<String, Object> body = new HashMap<>();
        body.put("flow_id",    alertTemplateId);
        body.put("sender",     senderId);
        body.put("recipients", List.of(recipient));

        send(body, "transaction alert to " + maskPhone(phone));
    }

    // ── Login alert ───────────────────────────────────────────────────────────

    /**
     * Sends a new-login alert so the user can detect unauthorised access.
     * Template must contain {{CITY}} variable (pass IP city or "Unknown location").
     */
    public void sendLoginAlert(String phone, String locationHint) {
        if (!smsEnabled || phone == null || phone.isBlank()) return;

        Map<String, Object> recipient = new HashMap<>();
        recipient.put("mobiles",  normalise(phone));
        recipient.put("LOCATION", locationHint != null ? locationHint : "Unknown location");

        Map<String, Object> body = new HashMap<>();
        body.put("flow_id",    alertTemplateId);
        body.put("sender",     senderId);
        body.put("recipients", List.of(recipient));

        send(body, "login alert to " + maskPhone(phone));
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private void send(Map<String, Object> body, String description) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("authkey", apiKey);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            ResponseEntity<String> resp = restTemplate.postForEntity(MSG91_FLOW_URL, entity, String.class);

            if (!resp.getStatusCode().is2xxSuccessful()) {
                log.warn("SMS send failed for {}: HTTP {} — {}", description, resp.getStatusCode(), resp.getBody());
                metrics.smsFailed.increment();
            } else {
                log.debug("SMS sent: {}", description);
                metrics.smsOtpSent.increment();
            }
        } catch (Exception e) {
            // Never let SMS failure propagate — it must not break the main flow
            log.warn("SMS send error for {}: {}", description, e.getMessage());
            metrics.smsFailed.increment();
        }
    }

    /** Converts +91XXXXXXXXXX or 10-digit number to 91XXXXXXXXXX for MSG91. */
    private String normalise(String phone) {
        String digits = phone.replaceAll("[^0-9]", "");
        if (digits.length() == 10) return "91" + digits;
        if (digits.startsWith("91") && digits.length() == 12) return digits;
        return digits;
    }

    /** Returns last 4 digits for log safety: 91XXXXXX3210 → ****3210 */
    private String maskPhone(String phone) {
        String d = normalise(phone);
        if (d.length() < 4) return "****";
        return "****" + d.substring(d.length() - 4);
    }
}
