package com.fintwin.service;

import com.fintwin.config.HttpClients;
import io.github.resilience4j.retry.annotation.Retry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.concurrent.TimeUnit;

@Service
public class SetuAAService {

    private static final Logger log = LoggerFactory.getLogger(SetuAAService.class);

    @Value("${setu.aa.base-url}")
    private String baseUrl;

    @Value("${setu.aa.client-id}")
    private String clientId;

    @Value("${setu.aa.client-secret}")
    private String clientSecret;

    @Value("${setu.aa.redirect-url}")
    private String redirectUrl;

    @Value("${setu.aa.product-instance-id}")
    private String productInstanceId;

    private final RestTemplate restTemplate = HttpClients.externalApi();

    // ── Auth headers (Setu v2 uses direct header auth, no OAuth2) ─────────────

    private HttpHeaders authHeaders() {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        h.set("x-client-id",           clientId);
        h.set("x-client-secret",       clientSecret);
        h.set("x-product-instance-id", productInstanceId);
        return h;
    }

    // ── Consent creation ──────────────────────────────────────────────────────

    @Retry(name = "setu-api")
    public Map<String, Object> createConsent(String customerVua) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("vua",             customerVua);
        body.put("consentMode",     "STORE");
        body.put("consentTypes",    List.of("TRANSACTIONS", "SUMMARY", "PROFILE"));
        body.put("fiTypes",         List.of("DEPOSIT", "MUTUAL_FUNDS", "EQUITIES", "NPS"));
        body.put("dataRange",       Map.of("from", isoNow(-90), "to", isoNow(1)));
        body.put("consentDuration", Map.of("unit", "MONTH", "value", 12));
        body.put("frequency",       Map.of("unit", "MONTH", "value", 30));
        body.put("redirectUrl",     redirectUrl);
        Map<String, Object> purpose = new LinkedHashMap<>();
        purpose.put("code",     "101");
        purpose.put("refUri",   "https://api.rebit.org.in/aa/purpose/101.xml");
        purpose.put("text",     "Wealth management service");
        purpose.put("category", Map.of("type", "Personal Finance"));
        body.put("purpose", purpose);

        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    baseUrl + "/v2/consents",
                    HttpMethod.POST,
                    new HttpEntity<>(body, authHeaders()),
                    Map.class
            );
            return response.getBody();
        } catch (HttpClientErrorException e) {
            log.error("Setu consent creation failed: {} — {}", e.getStatusCode(), e.getResponseBodyAsString());
            throw new RuntimeException("Setu returned " + e.getStatusCode() + ": " + e.getResponseBodyAsString());
        } catch (RestClientException e) {
            log.error("Setu API unreachable: {}", e.getMessage());
            throw new RuntimeException("Could not reach Setu API: " + e.getMessage());
        }
    }

    // ── Consent status poll (recovery for missed webhooks) ────────────────────

    @Retry(name = "setu-api")
    public Map<String, Object> getConsentStatus(String consentHandleOrId) {
        ResponseEntity<Map> response = restTemplate.exchange(
                baseUrl + "/v2/consents/" + consentHandleOrId,
                HttpMethod.GET,
                new HttpEntity<>(authHeaders()),
                Map.class
        );
        log.debug("Consent status poll completed — status={}", response.getBody() != null ? response.getBody().get("status") : "null");
        return response.getBody();
    }

    // ── FI Session ────────────────────────────────────────────────────────────

    public String createFISession(String consentId) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("consentId", consentId);
        body.put("dataRange", Map.of("from", isoNow(-90), "to", isoNow(0)));
        body.put("format", "json");

        ResponseEntity<Map> response = restTemplate.exchange(
                baseUrl + "/v2/sessions",
                HttpMethod.POST,
                new HttpEntity<>(body, authHeaders()),
                Map.class
        );

        Map<String, Object> resp = response.getBody();
        if (resp == null) return null;
        Object id = resp.get("id") != null ? resp.get("id") : resp.get("sessionId");
        return id != null ? id.toString() : null;
    }

    // ── Poll session until COMPLETED (for manual sync, avoids webhook dependency) ──

    @SuppressWarnings("unchecked")
    public String createFISessionAndWait(String consentId) {
        String sessionId = createFISession(consentId);
        if (sessionId == null) return null;

        // Poll up to 10 times with 3s delay (~30s total)
        for (int i = 0; i < 10; i++) {
            try {
                TimeUnit.SECONDS.sleep(3);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt(); // preserve cancellation, stop polling
                return null;
            }
            try {
                ResponseEntity<Map> res = restTemplate.exchange(
                        baseUrl + "/v2/sessions/" + sessionId,
                        HttpMethod.GET,
                        new HttpEntity<>(authHeaders()),
                        Map.class
                );
                Map<String, Object> body = res.getBody();
                if (body == null) continue;
                String status = body.get("status") != null ? body.get("status").toString() : null;
                log.debug("FI session poll {}: status={}", i + 1, status);
                if ("COMPLETED".equalsIgnoreCase(status) || "PARTIAL_SUCCESS".equalsIgnoreCase(status)) {
                    return sessionId;
                }
                if ("FAILED".equalsIgnoreCase(status)) {
                    // FAILUREXXXXX sandbox account causes session-level FAILED but other
                    // accounts may still have data — attempt fetch anyway
                    log.warn("FI session FAILED — attempting partial data fetch");
                    return sessionId;
                }
                if ("EXPIRED".equalsIgnoreCase(status)) return null;
            } catch (Exception e) {
                log.warn("Session poll error: {}", e.getMessage());
            }
        }
        return null; // timed out
    }

    // ── FI Data fetch — all types ─────────────────────────────────────────────

    /**
     * Fetches the full session data and buckets each account by its fiType.
     * Returns: { "DEPOSIT": [accountData, ...], "MUTUAL_FUNDS": [...], ... }
     * Each value is the raw `data.account` map from Setu's response.
     * Accounts with no fiType field default to "DEPOSIT".
     */
    @Retry(name = "setu-api")
    @SuppressWarnings("unchecked")
    public Map<String, List<Map<String, Object>>> fetchAllFIData(String sessionId) {
        ResponseEntity<Map> response = restTemplate.exchange(
                baseUrl + "/v2/sessions/" + sessionId,
                HttpMethod.GET,
                new HttpEntity<>(authHeaders()),
                Map.class
        );

        Map<String, Object> body = response.getBody();
        if (body == null) return Map.of();

        log.debug("Setu fetchAllFIData status={}", body.get("status"));

        Map<String, List<Map<String, Object>>> result = new HashMap<>();

        List<Map<String, Object>> fips = (List<Map<String, Object>>) body.get("fips");
        if (fips == null) return result;

        for (Map<String, Object> fip : fips) {
            List<Map<String, Object>> accounts = (List<Map<String, Object>>) fip.get("accounts");
            if (accounts == null) continue;

            for (Map<String, Object> wrapper : accounts) {
                // fiType may be sent as "fiType" or "FIType" — check both
                String fiType = wrapper.containsKey("fiType")   ? wrapper.get("fiType").toString()
                              : wrapper.containsKey("FIType")   ? wrapper.get("FIType").toString()
                              : "DEPOSIT";

                // Skip accounts that failed at the FIP level (e.g. FAILUREXXXXX sandbox account)
                Object accStatus = wrapper.get("status");
                if (accStatus != null && "FAILED".equalsIgnoreCase(accStatus.toString())) {
                    log.debug("Skipping FAILED account in FI response");
                    continue;
                }

                try {
                    // data may be a Map or a List (Setu v2 wraps in array in some responses)
                    Object rawData = wrapper.get("data");
                    Map<String, Object> data;
                    if (rawData instanceof List) {
                        List<Map<String, Object>> dataList = (List<Map<String, Object>>) rawData;
                        data = dataList.isEmpty() ? null : dataList.get(0);
                    } else {
                        data = (Map<String, Object>) rawData;
                    }
                    if (data == null) continue;
                    Map<String, Object> account = (Map<String, Object>) data.get("account");
                    if (account == null) continue;

                    result.computeIfAbsent(fiType, k -> new ArrayList<>()).add(account);
                } catch (Exception e) {
                    log.warn("Error parsing FI account ({}): {}", fiType, e.getMessage());
                }
            }
        }

        return result;
    }

    // ── DEPOSIT transactions (kept for backward-compat, delegates to fetchAllFIData) ──

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> fetchTransactions(String sessionId) {
        ResponseEntity<Map> response = restTemplate.exchange(
                baseUrl + "/v2/sessions/" + sessionId,
                HttpMethod.GET,
                new HttpEntity<>(authHeaders()),
                Map.class
        );

        Map<String, Object> body = response.getBody();
        if (body == null) return List.of();

        List<Map<String, Object>> transactions = new ArrayList<>();

        // Setu v2 response: {fips: [{accounts: [{data: {account: {transactions: {transaction: []}}}}]}]}
        List<Map<String, Object>> fips = (List<Map<String, Object>>) body.get("fips");
        if (fips == null) return List.of();

        for (Map<String, Object> fip : fips) {
            List<Map<String, Object>> accounts = (List<Map<String, Object>>) fip.get("accounts");
            if (accounts == null) continue;

            for (Map<String, Object> accountWrapper : accounts) {
                try {
                    Map<String, Object> data    = (Map<String, Object>) accountWrapper.get("data");
                    if (data == null) continue;
                    Map<String, Object> account = (Map<String, Object>) data.get("account");
                    if (account == null) continue;
                    Map<String, Object> txnWrapper = (Map<String, Object>) account.get("transactions");
                    if (txnWrapper == null) continue;
                    List<Map<String, Object>> txns = (List<Map<String, Object>>) txnWrapper.get("transaction");
                    if (txns != null) transactions.addAll(txns);
                } catch (Exception e) {
                    log.warn("Error parsing account data: {}", e.getMessage());
                }
            }
        }

        return transactions;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private String isoNow(int offsetDays) {
        return Instant.now()
                .atOffset(ZoneOffset.UTC)
                .plusDays(offsetDays)
                .format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"));
    }
}
