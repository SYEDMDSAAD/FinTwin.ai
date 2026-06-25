package com.fintwin.service;

import com.fintwin.dto.CryptoConnectionDTO;
import com.fintwin.model.CryptoConnection;
import com.fintwin.model.Investment;
import com.fintwin.model.User;
import com.fintwin.repository.CryptoConnectionRepository;
import com.fintwin.repository.InvestmentRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class CryptoConnectionService {

    private static final Logger log = LoggerFactory.getLogger(CryptoConnectionService.class);

    private static final String BINANCE_BASE  = "https://api.binance.com";
    private static final String WAZIRX_BASE   = "https://api.wazirx.com";
    private static final double MIN_VALUE_INR = 10.0; // ignore dust balances below ₹10

    private final CryptoConnectionRepository connRepo;
    private final InvestmentRepository       investmentRepo;
    private final UserRepository             userRepo;
    private final RestTemplate               restTemplate = new RestTemplate();

    public CryptoConnectionService(CryptoConnectionRepository connRepo,
                                   InvestmentRepository investmentRepo,
                                   UserRepository userRepo) {
        this.connRepo       = connRepo;
        this.investmentRepo = investmentRepo;
        this.userRepo       = userRepo;
    }

    // ── Connect a new exchange ────────────────────────────────────────────────

    @PreAuthorize("hasAuthority('WRITE_OWN_INVESTMENTS')")
    public CryptoConnectionDTO connect(String exchange, String apiKey, String apiSecret) {
        User user = currentUser();

        CryptoConnection conn = new CryptoConnection();
        conn.setUser(user);
        conn.setExchange(exchange);
        conn.setApiKey(apiKey);       // stored AES-256/GCM encrypted via @Convert
        conn.setApiSecret(apiSecret); // same
        conn = connRepo.save(conn);

        // Trigger an immediate sync to verify the credentials work
        try {
            int synced = syncConnection(conn);
            conn.setSyncStatus(synced >= 0 ? "ACTIVE" : "ERROR");
        } catch (Exception e) {
            conn.setSyncStatus("ERROR");
            log.warn("Initial crypto sync failed for {} connection #{}: {}", exchange, conn.getId(), e.getMessage());
        }
        connRepo.save(conn);
        return new CryptoConnectionDTO(conn);
    }

    // ── List connections (no credentials) ────────────────────────────────────

    @PreAuthorize("hasAuthority('READ_OWN_INVESTMENTS')")
    public List<CryptoConnectionDTO> list() {
        User user = currentUser();
        return connRepo.findByUser(user).stream()
                .map(CryptoConnectionDTO::new)
                .collect(Collectors.toList());
    }

    // ── Manual sync ───────────────────────────────────────────────────────────

    @PreAuthorize("hasAuthority('WRITE_OWN_INVESTMENTS')")
    public CryptoConnectionDTO resync(Long connectionId) {
        User user = currentUser();
        CryptoConnection conn = connRepo.findById(connectionId)
                .orElseThrow(() -> new RuntimeException("Connection not found"));
        if (!conn.getUser().getId().equals(user.getId()))
            throw new RuntimeException("Unauthorized");

        syncConnection(conn);
        connRepo.save(conn);
        return new CryptoConnectionDTO(conn);
    }

    // ── Delete connection ─────────────────────────────────────────────────────

    @PreAuthorize("hasAuthority('WRITE_OWN_INVESTMENTS')")
    public void disconnect(Long connectionId) {
        User user = currentUser();
        CryptoConnection conn = connRepo.findById(connectionId)
                .orElseThrow(() -> new RuntimeException("Connection not found"));
        if (!conn.getUser().getId().equals(user.getId()))
            throw new RuntimeException("Unauthorized");
        connRepo.delete(conn);
    }

    // ── Core sync logic ───────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private int syncConnection(CryptoConnection conn) {
        String exchange = conn.getExchange();
        List<Map<String, Object>> balances;

        try {
            balances = switch (exchange.toUpperCase()) {
                case "BINANCE"  -> fetchBinanceBalances(conn);
                case "WAZIRX"   -> fetchWazirXBalances(conn);
                default         -> throw new RuntimeException("Unsupported exchange: " + exchange);
            };
        } catch (RuntimeException e) {
            conn.setSyncStatus("ERROR");
            throw e;
        } catch (Exception e) {
            conn.setSyncStatus("ERROR");
            throw new RuntimeException(e);
        }

        User user = conn.getUser();

        // Load existing crypto investments keyed by ticker to avoid duplicates
        Map<String, Investment> existingByTicker = investmentRepo.findByUser(user).stream()
                .filter(i -> "Crypto".equals(i.getType()) && i.getTickerCode() != null)
                .collect(Collectors.toMap(Investment::getTickerCode, i -> i, (a, b) -> a));

        int saved = 0;
        for (Map<String, Object> b : balances) {
            String asset = safeStr(b, "asset");
            double free  = parseDouble(b.get("free"));
            double locked = parseDouble(b.get("locked"));
            double total  = free + locked;
            if (total <= 0) continue;

            // Skip stablecoins and exchange-specific tokens (no meaningful P&L tracking)
            if (isStablecoin(asset)) continue;

            String ticker = asset + "-USD"; // yfinance format used by AI pricing service

            Investment inv = existingByTicker.getOrDefault(ticker, null);
            if (inv == null) {
                inv = new Investment();
                inv.setUser(user);
                inv.setType("Crypto");
                inv.setTickerCode(ticker);
                inv.setPurchaseDate(LocalDate.now());
            }
            inv.setName(asset);
            inv.setUnits(total);
            // investedAmount left as-is if already set by user; set 0 for new entries
            if (inv.getInvestedAmount() == null) inv.setInvestedAmount(0.0);

            investmentRepo.save(inv);
            existingByTicker.put(ticker, inv);
            saved++;
        }

        conn.setSyncStatus("ACTIVE");
        conn.setLastSyncedAt(LocalDateTime.now());
        log.info("Crypto sync ({}): {} holding(s) upserted for user #{}", exchange, saved, user.getId());
        return saved;
    }

    // ── Binance ───────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> fetchBinanceBalances(CryptoConnection conn) throws Exception {
        long timestamp = System.currentTimeMillis();
        String query   = "timestamp=" + timestamp;
        String sig     = hmacSha256(query, conn.getApiSecret());
        String url     = BINANCE_BASE + "/api/v3/account?" + query + "&signature=" + sig;

        HttpHeaders headers = new HttpHeaders();
        headers.set("X-MBX-APIKEY", conn.getApiKey());

        ResponseEntity<Map> resp = restTemplate.exchange(
                url, HttpMethod.GET, new HttpEntity<>(headers), Map.class);

        Map<String, Object> body = resp.getBody();
        if (body == null || !body.containsKey("balances"))
            throw new RuntimeException("Unexpected Binance response structure");

        return (List<Map<String, Object>>) body.get("balances");
    }

    // ── WazirX ───────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> fetchWazirXBalances(CryptoConnection conn) throws Exception {
        long timestamp = System.currentTimeMillis();
        String query   = "recvWindow=5000&timestamp=" + timestamp;
        String sig     = hmacSha256(query, conn.getApiSecret());
        String url     = WAZIRX_BASE + "/sapi/v1/account?" + query + "&signature=" + sig;

        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Api-Key", conn.getApiKey());

        ResponseEntity<Map> resp = restTemplate.exchange(
                url, HttpMethod.GET, new HttpEntity<>(headers), Map.class);

        Map<String, Object> body = resp.getBody();
        if (body == null || !body.containsKey("assets"))
            throw new RuntimeException("Unexpected WazirX response structure");

        // WazirX returns { assets: { BTC: { free: "0.01", locked: "0" }, ... } }
        Map<String, Map<String, Object>> assets = (Map<String, Map<String, Object>>) body.get("assets");
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map.Entry<String, Map<String, Object>> e : assets.entrySet()) {
            Map<String, Object> entry = new HashMap<>(e.getValue());
            entry.put("asset", e.getKey().toUpperCase());
            result.add(entry);
        }
        return result;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private String hmacSha256(String data, String secret) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        for (byte b : hash) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    private static final Set<String> STABLECOINS =
            Set.of("USDT", "USDC", "BUSD", "DAI", "TUSD", "USDP", "INR", "EUR", "GBP");

    private boolean isStablecoin(String asset) {
        if (asset == null) return true;
        return STABLECOINS.contains(asset.toUpperCase());
    }

    private double parseDouble(Object v) {
        if (v == null) return 0;
        try { return Double.parseDouble(v.toString()); }
        catch (Exception e) { return 0; }
    }

    private String safeStr(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v != null ? v.toString() : null;
    }

    private User currentUser() {
        return userRepo.findByEmail(SecurityUtils.getCurrentUserEmail()).orElseThrow();
    }
}
