package com.fintwin.service;

import com.fintwin.audit.Audited;
import com.fintwin.model.BankConnection;
import com.fintwin.model.Investment;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.BankConnectionRepository;
import com.fintwin.repository.InvestmentRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class BankConnectionService {

    private static final Logger log = LoggerFactory.getLogger(BankConnectionService.class);

    private final SetuAAService            setuAAService;
    private final BankConnectionRepository bankRepo;
    private final TransactionRepository    txnRepo;
    private final UserRepository           userRepo;
    private final InvestmentRepository     investmentRepo;

    public BankConnectionService(
            SetuAAService setuAAService,
            BankConnectionRepository bankRepo,
            TransactionRepository txnRepo,
            UserRepository userRepo,
            InvestmentRepository investmentRepo
    ) {
        this.setuAAService  = setuAAService;
        this.bankRepo       = bankRepo;
        this.txnRepo        = txnRepo;
        this.userRepo       = userRepo;
        this.investmentRepo = investmentRepo;
    }

    // ── Initiate consent ──────────────────────────────────────────────────────

    /**
     * Creates a Setu consent request and stores a PENDING BankConnection.
     * vua — the user's AA Virtual User Address (e.g. 9876543210@onemoney).
     * In sandbox, pass null to use the Setu test number.
     */
    @PreAuthorize("hasAuthority('CONNECT_BANK_ACCOUNT')")
    @Audited(action = "WRITE", resource = "bank_connection", description = "Bank account connection initiated")
    public Map<String, Object> initiateConnection(String vua) {
        String email = SecurityUtils.getCurrentUserEmail();
        User user    = userRepo.findByEmail(email).orElseThrow();

        // Prevent duplicate in-flight consent flows. A user should not have two
        // active consent windows open simultaneously — each creates a separate Setu
        // consent request that would both fire webhooks and double-insert data.
        List<BankConnection> activeConns = new ArrayList<>();
        activeConns.addAll(bankRepo.findByUserAndConsentStatus(user, "ACTIVE"));
        activeConns.addAll(bankRepo.findByUserAndConsentStatus(user, "FETCHING"));
        if (!activeConns.isEmpty()) {
            throw new RuntimeException("You already have a connected bank account. Disconnect it first before adding another.");
        }
        bankRepo.findTopByConsentStatusOrderByCreatedAtDesc("PENDING").ifPresent(existing -> {
            if (existing.getUser().getId().equals(user.getId())
                    && existing.getCreatedAt().isAfter(LocalDateTime.now().minusMinutes(30))) {
                throw new RuntimeException("A bank connection is already in progress. Please complete it or wait a few minutes before trying again.");
            }
        });

        // Sandbox test VUA — replace with user's real AA ID in production
        String customerVua = (vua != null && !vua.isBlank()) ? vua : "9876543210@onemoney";

        Map<String, Object> setuResponse = setuAAService.createConsent(customerVua);

        if (setuResponse == null || setuResponse.get("id") == null || setuResponse.get("url") == null) {
            log.error("Setu consent creation failed — null or incomplete response");
            throw new RuntimeException("Setu consent creation failed: " +
                (setuResponse != null ? setuResponse.getOrDefault("errorMessage",
                    setuResponse.getOrDefault("message", setuResponse.toString())) : "null response"));
        }

        String consentHandle = setuResponse.get("id").toString();
        String redirectUrl   = setuResponse.get("url").toString();

        BankConnection conn = new BankConnection();
        conn.setUser(user);
        conn.setConsentHandle(consentHandle);
        conn.setConsentStatus("PENDING");
        conn.setCreatedAt(LocalDateTime.now());
        bankRepo.save(conn);

        Map<String, Object> result = new HashMap<>();
        result.put("consentHandle", consentHandle);
        result.put("redirectUrl",   redirectUrl);
        return result;
    }

    // ── Handle consent approval (called by webhook) ───────────────────────────

    @Transactional
    @SuppressWarnings("unchecked")
    public void handleConsentActive(String consentId, Map<String, Object> data) {
        // Setu webhook has no consentHandle — match by consentId if already stored,
        // otherwise take the most recent PENDING connection.
        // Note: findByConsentId never matches because consentId is AES-encrypted,
        // so we always fall back to the PENDING status lookup.
        BankConnection conn = bankRepo.findByConsentId(consentId)
                .orElseGet(() -> bankRepo
                        .findTopByConsentStatusOrderByCreatedAtDesc("PENDING")
                        .orElse(null));

        if (conn == null) {
            log.warn("No matching BankConnection found for incoming consent event");
            return;
        }

        // Idempotency: Setu may retry CONSENT_STATUS_UPDATE. If the connection is
        // no longer PENDING it was already processed by a prior call — skip.
        if (!"PENDING".equals(conn.getConsentStatus())) {
            log.info("Consent event ignored — connection #{} already in status={}",
                    conn.getId(), conn.getConsentStatus());
            return;
        }

        conn.setConsentId(consentId);
        conn.setConsentStatus("ACTIVE");
        extractAccountDetails(conn, data);
        bankRepo.save(conn);

        try {
            String sessionId = setuAAService.createFISession(consentId);
            if (sessionId != null) {
                conn.setConsentStatus("FETCHING");
                bankRepo.save(conn);
            }
        } catch (Exception e) {
            log.error("FI session creation failed: {}", e.getMessage());
        }
    }

    // ── Handle FI data ready (called by webhook) ──────────────────────────────

    @Transactional
    public void handleSessionCompleted(String consentId, String sessionId) {
        // consentId is AES-encrypted so findByConsentId never matches — fall back
        // to the most recent FETCHING connection
        BankConnection approx = bankRepo.findByConsentId(consentId)
                .orElseGet(() -> bankRepo
                        .findTopByConsentStatusOrderByCreatedAtDesc("FETCHING")
                        .orElse(null));
        if (approx == null) {
            log.warn("No matching BankConnection found for SESSION_STATUS_UPDATE");
            return;
        }

        // Acquire a DB-level write lock so concurrent retries of the same session
        // webhook are serialized — the second call will block here until the first
        // transaction commits, then see lastProcessedSessionId already set and exit
        BankConnection conn = bankRepo.findByIdWithLock(approx.getId()).orElse(approx);

        if (sessionId.equals(conn.getLastProcessedSessionId())) {
            log.info("Session {} already processed for connection #{} — ignoring duplicate webhook",
                    sessionId, conn.getId());
            return;
        }

        // Stamp the session ID before processing so any concurrent call that
        // survives the lock check above also skips (belt-and-suspenders)
        conn.setLastProcessedSessionId(sessionId);
        bankRepo.saveAndFlush(conn);

        processSessionCompleted(conn, sessionId);
    }

    // ── Core FI processing — called directly when conn is already in scope ────

    @SuppressWarnings("unchecked")
    void processSessionCompleted(BankConnection conn, String sessionId) {
        User user = conn.getUser();

        try {
            Map<String, List<Map<String, Object>>> allData =
                    setuAAService.fetchAllFIData(sessionId);

            log.debug("FI data received for session — fiTypes={}", allData.keySet());

            // ── DEPOSIT → bank transactions ───────────────────────────
            // Pre-load all existing external IDs in one query to avoid N+1
            Set<String> existingExternalIds = txnRepo.findExternalIdsByUser(user);

            List<Transaction> newTxns = new ArrayList<>();
            for (Map<String, Object> account : allData.getOrDefault("DEPOSIT", List.of())) {
                try {
                    Map<String, Object> txnWrapper = (Map<String, Object>) account.get("transactions");
                    if (txnWrapper == null) continue;
                    List<Map<String, Object>> txns = (List<Map<String, Object>>) txnWrapper.get("transaction");
                    if (txns == null) continue;
                    for (Map<String, Object> raw : txns) {
                        Transaction t = buildIfNew(raw, user, conn, existingExternalIds);
                        if (t != null) newTxns.add(t);
                    }
                } catch (Exception e) {
                    log.warn("Deposit parse error: {}", e.getMessage());
                }
            }
            if (!newTxns.isEmpty()) {
                // Real bank data arrived — replace synthetic seeded placeholder transactions
                txnRepo.deleteAll(txnRepo.findSeededByUser(user));
                txnRepo.saveAll(newTxns);
            }
            log.info("Bank sync: {} new transactions saved for user #{}", newTxns.size(), user.getId());

            // ── MUTUAL_FUNDS / EQUITIES / NPS → investment holdings ───
            // Pre-load existing investment names in one query to avoid N+1
            Set<String> existingInvNames = investmentRepo.findByUser(user).stream()
                    .map(Investment::getName)
                    .collect(Collectors.toSet());

            List<Investment> newInvestments = new ArrayList<>();
            int mfSaved = buildMFHoldings(allData.getOrDefault("MUTUAL_FUNDS", List.of()), user, existingInvNames, newInvestments);
            int eqSaved = buildEquityHoldings(allData.getOrDefault("EQUITIES", List.of()), user, existingInvNames, newInvestments);
            buildNPSHolding(allData.getOrDefault("NPS", List.of()), user, existingInvNames, newInvestments);
            if (!newInvestments.isEmpty()) investmentRepo.saveAll(newInvestments);
            if (mfSaved > 0) log.info("MF sync: {} new holdings saved for user #{}", mfSaved, user.getId());
            if (eqSaved > 0) log.info("Equity sync: {} new holdings saved for user #{}", eqSaved, user.getId());

        } catch (Exception e) {
            log.error("FI fetch failed for session: {}", e.getMessage());
        }

        conn.setConsentStatus("ACTIVE");
        conn.setLastSyncedAt(LocalDateTime.now());
        bankRepo.save(conn);
    }

    // ── MF holdings parser ────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private int buildMFHoldings(List<Map<String, Object>> accounts, User user,
                                Set<String> existingNames, List<Investment> out) {
        int count = 0;
        for (Map<String, Object> account : accounts) {
            try {
                Map<String, Object> holdings = (Map<String, Object>) account.get("holdings");
                if (holdings == null) continue;
                List<Map<String, Object>> holdingList = (List<Map<String, Object>>) holdings.get("holding");
                if (holdingList == null) continue;

                for (Map<String, Object> h : holdingList) {
                    String name     = safeStr(h, "schemeName");
                    if (name == null || existingNames.contains(name)) continue;

                    String amfiCode = safeStr(h, "amfiCode") != null ? safeStr(h, "amfiCode") : safeStr(h, "schemeCode");
                    Object unitsObj = h.get("closingUnits") != null ? h.get("closingUnits") : h.get("units");
                    Object currValObj = h.get("currentValue");
                    Object costObj  = h.get("costValue") != null ? h.get("costValue") : h.get("investedValue");

                    Investment inv = new Investment();
                    inv.setUser(user);
                    inv.setName(name);
                    inv.setType("Mutual Fund");
                    inv.setTickerCode(amfiCode);
                    inv.setUnits(unitsObj  != null ? Double.parseDouble(unitsObj.toString())  : null);
                    inv.setInvestedAmount(costObj   != null ? Double.parseDouble(costObj.toString())   : null);
                    inv.setCurrentValue(currValObj  != null ? Double.parseDouble(currValObj.toString()) : null);
                    inv.setPurchaseDate(LocalDate.now());
                    out.add(inv);
                    existingNames.add(name);
                    count++;
                }
            } catch (Exception e) {
                log.warn("MF holding parse error: {}", e.getMessage());
            }
        }
        return count;
    }

    // ── Equity holdings parser ────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private int buildEquityHoldings(List<Map<String, Object>> accounts, User user,
                                    Set<String> existingNames, List<Investment> out) {
        int count = 0;
        for (Map<String, Object> account : accounts) {
            try {
                Map<String, Object> holdings = (Map<String, Object>) account.get("holdings");
                if (holdings == null) continue;
                List<Map<String, Object>> holdingList = (List<Map<String, Object>>) holdings.get("holding");
                if (holdingList == null) continue;

                for (Map<String, Object> h : holdingList) {
                    String name = safeStr(h, "issuerName") != null ? safeStr(h, "issuerName") : safeStr(h, "isinDescription");
                    if (name == null || existingNames.contains(name)) continue;

                    String isin      = safeStr(h, "isin");
                    Object sharesObj = h.get("units");
                    Object priceObj  = h.get("lastTradedPrice") != null ? h.get("lastTradedPrice") : h.get("closingPrice");
                    double shares    = sharesObj != null ? Double.parseDouble(sharesObj.toString()) : 0;
                    double price     = priceObj  != null ? Double.parseDouble(priceObj.toString())  : 0;
                    double currVal   = shares * price;
                    String ticker    = safeStr(h, "ticker") != null ? safeStr(h, "ticker") : deriveTicker(name);

                    Investment inv = new Investment();
                    inv.setUser(user);
                    inv.setName(name);
                    inv.setType("Stocks");
                    inv.setTickerCode(ticker);
                    inv.setUnits(shares  > 0 ? shares  : null);
                    inv.setCurrentValue(currVal > 0 ? currVal : null);
                    inv.setInvestedAmount(currVal > 0 ? currVal : null);
                    inv.setPurchaseDate(LocalDate.now());
                    inv.setNotes(isin != null ? "ISIN: " + isin : null);
                    out.add(inv);
                    existingNames.add(name);
                    count++;
                }
            } catch (Exception e) {
                log.warn("Equity holding parse error: {}", e.getMessage());
            }
        }
        return count;
    }

    // ── NPS parser ────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private void buildNPSHolding(List<Map<String, Object>> accounts, User user,
                                 Set<String> existingNames, List<Investment> out) {
        if (existingNames.contains("NPS Account")) return;
        for (Map<String, Object> account : accounts) {
            try {
                Map<String, Object> summary = (Map<String, Object>) account.get("summary");
                if (summary == null) continue;

                Object currVal = summary.get("currentValue");
                Object contrib = summary.get("contributionAmount") != null
                                 ? summary.get("contributionAmount") : summary.get("contributions");

                Investment inv = new Investment();
                inv.setUser(user);
                inv.setName("NPS Account");
                inv.setType("NPS");
                inv.setCurrentValue(currVal  != null ? Double.parseDouble(currVal.toString())  : null);
                inv.setInvestedAmount(contrib != null ? Double.parseDouble(contrib.toString()) : null);
                inv.setPurchaseDate(LocalDate.now());
                out.add(inv);
                existingNames.add("NPS Account");
                break;
            } catch (Exception e) {
                log.warn("NPS parse error: {}", e.getMessage());
            }
        }
    }

    // ── Ticker derivation (best-effort from company name) ────────────────────

    private String deriveTicker(String issuerName) {
        if (issuerName == null) return null;
        // Map common names to NSE tickers
        String n = issuerName.toUpperCase();
        if (n.contains("TCS") || n.contains("TATA CONSULTANCY"))      return "TCS";
        if (n.contains("INFOSYS"))                                      return "INFY";
        if (n.contains("RELIANCE"))                                     return "RELIANCE";
        if (n.contains("HDFC BANK"))                                    return "HDFCBANK";
        if (n.contains("ICICI BANK"))                                   return "ICICIBANK";
        if (n.contains("WIPRO"))                                        return "WIPRO";
        if (n.contains("HCL"))                                          return "HCLTECH";
        if (n.contains("BHARTI") || n.contains("AIRTEL"))              return "BHARTIARTL";
        if (n.contains("KOTAK"))                                        return "KOTAKBANK";
        if (n.contains("AXIS BANK"))                                    return "AXISBANK";
        if (n.contains("BAJAJ FINANCE") && !n.contains("FINSERV"))     return "BAJFINANCE";
        if (n.contains("BAJAJ FINSERV"))                                return "BAJAJFINSV";
        if (n.contains("ASIAN PAINT"))                                  return "ASIANPAINT";
        if (n.contains("MARUTI"))                                       return "MARUTI";
        if (n.contains("TITAN"))                                        return "TITAN";
        if (n.contains("ITC"))                                          return "ITC";
        if (n.contains("LARSEN") || n.contains("L&T"))                 return "LT";
        if (n.contains("NESTLE"))                                       return "NESTLEIND";
        if (n.contains("ULTRATECH"))                                    return "ULTRACEMCO";
        return null; // unknown — user can fill in later
    }

    // ── Force re-sync for a specific connection (any status) ─────────────────

    @PreAuthorize("hasAuthority('CONNECT_BANK_ACCOUNT')")
    public String forceResync(Long connectionId) {
        String email = SecurityUtils.getCurrentUserEmail();
        User user    = userRepo.findByEmail(email).orElseThrow();

        BankConnection conn = bankRepo.findById(connectionId)
                .orElseThrow(() -> new RuntimeException("Connection not found"));

        if (!conn.getUser().getId().equals(user.getId())) {
            throw new RuntimeException("Unauthorized");
        }
        if (conn.getConsentId() == null) {
            return "Consent not yet approved. Please complete the bank consent flow first.";
        }
        if ("FETCHING".equals(conn.getConsentStatus())) {
            return "Sync already in progress. Please wait for the current sync to complete.";
        }

        try {
            conn.setConsentStatus("FETCHING");
            bankRepo.saveAndFlush(conn); // flush immediately so concurrent calls see FETCHING

            String sessionId = setuAAService.createFISessionAndWait(conn.getConsentId());
            if (sessionId != null) {
                processSessionCompleted(conn, sessionId);
                return "Sync completed. Check your transactions.";
            } else {
                conn.setConsentStatus("ACTIVE");
                bankRepo.save(conn);
                return "Session timed out — Setu may still be preparing your data. Try again in a minute.";
            }
        } catch (Exception e) {
            conn.setConsentStatus("ACTIVE");
            bankRepo.save(conn);
            String msg = e.getMessage() != null ? e.getMessage() : "";
            log.error("Force resync failed for connection #{}: {}", connectionId, msg);
            if (msg.contains("Consent use exceeded")) {
                return "This consent has reached its monthly fetch limit. Please disconnect and reconnect your bank to create a new consent.";
            }
            return "Sync failed: " + msg;
        }
    }

    // ── Manual sync: recover PENDING connections whose webhook was missed ─────

    @SuppressWarnings("unchecked")
    public String syncPendingConnections() {
        String email = SecurityUtils.getCurrentUserEmail();
        User user    = userRepo.findByEmail(email).orElseThrow();

        List<BankConnection> pending = new ArrayList<>();
        pending.addAll(bankRepo.findByUserAndConsentStatus(user, "PENDING"));
        // Skip FETCHING connections — forceResync is already processing them.
        // Adding them here would create a second concurrent Setu session → duplicates.
        // Also recover ACTIVE connections that have never been synced
        bankRepo.findByUserAndConsentStatus(user, "ACTIVE").stream()
                .filter(c -> c.getLastSyncedAt() == null && c.getConsentId() != null)
                .forEach(pending::add);
        if (pending.isEmpty()) return "No pending or stuck connections found.";

        int recovered = 0;
        for (BankConnection conn : pending) {
            try {
                String consentId = conn.getConsentId();

                // ACTIVE connections already have consentId — skip polling, go straight to FI fetch
                if (consentId == null) {
                    if (conn.getConsentHandle() == null) continue;
                    Map<String, Object> resp = setuAAService.getConsentStatus(conn.getConsentHandle());
                    if (resp == null) continue;

                    String status = resp.get("status") != null ? resp.get("status").toString() : null;
                    consentId     = resp.get("id")     != null ? resp.get("id").toString()     : null;
                    log.debug("Consent status poll for connection #{}: status={}", conn.getId(), status);

                    if (!"ACTIVE".equalsIgnoreCase(status) || consentId == null) continue;
                    conn.setConsentId(consentId);
                    extractAccountDetails(conn, resp);
                }

                conn.setConsentStatus("FETCHING");
                bankRepo.save(conn);

                String sessionId = setuAAService.createFISessionAndWait(consentId);
                if (sessionId != null) {
                    processSessionCompleted(conn, sessionId);
                } else {
                    conn.setConsentStatus("ACTIVE");
                    bankRepo.save(conn);
                    log.warn("Session timed out or failed for connection #{}", conn.getId());
                }
                recovered++;
            } catch (Exception e) {
                String msg = e.getMessage() != null ? e.getMessage() : "";
                log.error("Sync poll failed for connection #{}: {}", conn.getId(), msg);
                if (msg.contains("Consent use exceeded")) {
                    log.warn("Consent frequency limit hit for connection #{} — user must reconnect", conn.getId());
                }
            }
        }
        return recovered > 0
                ? "Recovered " + recovered + " connection(s). Data fetch in progress."
                : "Connections still pending on Setu side.";
    }

    // ── List connections ──────────────────────────────────────────────────────

    @PreAuthorize("hasAuthority('READ_OWN_BANK_CONNECTIONS')")
    @Audited(action = "READ", resource = "bank_connection", description = "Bank connections retrieved")
    public List<BankConnection> getConnections() {
        String email = SecurityUtils.getCurrentUserEmail();
        User user    = userRepo.findByEmail(email).orElseThrow();
        List<BankConnection> all = bankRepo.findByUser(user);
        // Auto-purge any REVOKED/EXPIRED connections so they don't clutter the UI
        all.stream()
           .filter(c -> "REVOKED".equals(c.getConsentStatus()) || "EXPIRED".equals(c.getConsentStatus()))
           .forEach(bankRepo::delete);
        return all.stream()
                  .filter(c -> !"REVOKED".equals(c.getConsentStatus()) && !"EXPIRED".equals(c.getConsentStatus()))
                  .collect(Collectors.toList());
    }

    // ── Disconnect ────────────────────────────────────────────────────────────

    @PreAuthorize("hasAuthority('DISCONNECT_BANK_ACCOUNT')")
    @Audited(action = "DELETE", resource = "bank_connection", description = "Bank connection removed")
    public void disconnect(Long id) {
        String email = SecurityUtils.getCurrentUserEmail();
        User user    = userRepo.findByEmail(email).orElseThrow();

        bankRepo.findById(id).ifPresent(conn -> {
            if (!conn.getUser().getId().equals(user.getId())) {
                throw new RuntimeException("Unauthorized");
            }
            bankRepo.delete(conn);
        });
    }

    // ── Extract masked account / bank name from Setu consent response ────────

    @SuppressWarnings("unchecked")
    private void extractAccountDetails(BankConnection conn, Map<String, Object> resp) {
        try {
            // Setu v2 GET /v2/consents/{id} response has accountsLinked at top level
            List<Map<String, Object>> accounts = (List<Map<String, Object>>) resp.get("accountsLinked");
            if (accounts == null) {
                // Webhook format has detail.accounts
                Map<String, Object> detail = (Map<String, Object>) resp.get("detail");
                if (detail != null) accounts = (List<Map<String, Object>>) detail.get("accounts");
            }
            if (accounts != null && !accounts.isEmpty()) {
                for (Map<String, Object> acc : accounts) {
                    String masked = safeStr(acc, "maskedAccNumber");
                    String fipId  = safeStr(acc, "fipId");
                    if (masked != null && !masked.toUpperCase().contains("FAILURE")) {
                        conn.setMaskedAccountNumber(masked);
                        if (fipId != null) conn.setBankName(fipId);
                        break;
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Could not extract account details from consent response: {}", e.getMessage());
        }
    }

    // ── Private: map Setu transaction → Transaction entity (no DB call) ────────

    private Transaction buildIfNew(Map<String, Object> raw, User user, BankConnection conn,
                                   Set<String> existingExternalIds) {
        String externalId = safeStr(raw, "txnId");
        if (externalId == null || existingExternalIds.contains(externalId)) return null;

        Object amtObj = raw.get("amount");
        if (amtObj == null) return null;

        String type   = safeStr(raw, "type");
        double amount = Double.parseDouble(amtObj.toString());
        if ("DEBIT".equalsIgnoreCase(type)) amount = -Math.abs(amount);
        else                                 amount =  Math.abs(amount);

        String narration = safeStr(raw, "narration");
        String timestamp = safeStr(raw, "transactionTimestamp");
        String date      = timestamp != null && timestamp.length() >= 10
                           ? timestamp.substring(0, 10)
                           : LocalDateTime.now().toString().substring(0, 10);

        // Populate masked account number on the connection object (once)
        if (conn.getMaskedAccountNumber() == null) {
            Object masked = raw.get("maskedAccNumber");
            if (masked != null) conn.setMaskedAccountNumber(masked.toString());
        }

        Transaction t = new Transaction();
        t.setUser(user);
        t.setDate(date);
        t.setMerchant(narration != null ? narration : "Bank Transaction");
        t.setAmount(amount);
        t.setCategory(deriveCategory(narration, type));
        t.setSource("BANK");
        t.setExternalId(externalId);
        existingExternalIds.add(externalId); // prevent duplicates within the same batch
        return t;
    }

    private String deriveCategory(String narration, String type) {
        if (narration == null) return "Other";
        String n = narration.toLowerCase();

        if (n.contains("swiggy") || n.contains("zomato") || n.contains("food"))
            return "Food";
        if (n.contains("uber") || n.contains("ola") || n.contains("rapido") || n.contains("metro"))
            return "Transport";
        if (n.contains("netflix") || n.contains("hotstar") || n.contains("spotify") || n.contains("youtube"))
            return "Entertainment";
        if (n.contains("amazon") || n.contains("flipkart") || n.contains("myntra"))
            return "Shopping";
        if (n.contains("electricity") || n.contains("water") || n.contains("gas") || n.contains("bill") || n.contains("recharge"))
            return "Utilities";
        if (n.contains("salary") || n.contains("credit") || n.contains("neft cr") || n.contains("inward"))
            return "Income";
        if (n.contains("rent") || n.contains("maintenance"))
            return "Housing";
        if (n.contains("hospital") || n.contains("pharmacy") || n.contains("medical") || n.contains("apollo") || n.contains("medplus"))
            return "Health";
        if (n.contains("emi") || n.contains("loan"))
            return "EMI";
        if ("CREDIT".equalsIgnoreCase(type))
            return "Income";

        return "Other";
    }

    private String safeStr(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v != null ? v.toString() : null;
    }
}
