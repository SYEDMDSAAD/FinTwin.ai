package com.fintwin.service;

import com.fintwin.audit.Audited;
import com.fintwin.exception.ForbiddenException;
import com.fintwin.exception.NotFoundException;
import com.fintwin.dto.InvestmentDTO;
import com.fintwin.dto.PortfolioSummaryDTO;
import com.fintwin.model.Investment;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.InvestmentRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class InvestmentService {

    private static final Logger log = LoggerFactory.getLogger(InvestmentService.class);

    private final InvestmentRepository repo;
    private final UserRepository       userRepo;
    private final TransactionRepository txnRepo;

    @Autowired
    @Qualifier("aiRestTemplate")
    private RestTemplate aiRestTemplate;

    @Value("${ai.service.url}")
    private String aiServiceUrl;

    public InvestmentService(InvestmentRepository repo, UserRepository userRepo, TransactionRepository txnRepo) {
        this.repo     = repo;
        this.userRepo = userRepo;
        this.txnRepo  = txnRepo;
    }

    @PreAuthorize("hasAuthority('READ_OWN_INVESTMENTS')")
    @Audited(action = "READ", resource = "portfolio", description = "Portfolio summary retrieved")
    public PortfolioSummaryDTO getSummary() {
        User user = currentUser();
        List<Investment> all = repo.findByUser(user);

        List<InvestmentDTO> holdings = all.stream()
                .map(InvestmentDTO::from)
                .collect(Collectors.toList());

        // Exact BigDecimal sums for the authoritative portfolio totals.
        BigDecimal totalInvested = all.stream()
                .map(i -> nz(i.getInvestedAmountExact()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal currentValue = all.stream()
                .map(i -> i.getCurrentValueExact() != null ? i.getCurrentValueExact()
                        : nz(i.getInvestedAmountExact()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalPnl = currentValue.subtract(totalInvested);
        // P&L % is a ratio — double is fine.
        double totalPnlPct = totalInvested.signum() > 0
                ? Math.round((totalPnl.doubleValue() / totalInvested.doubleValue()) * 10000.0) / 100.0
                : 0.0;

        Map<String, Double> allocation = new LinkedHashMap<>();
        double currentValueD = currentValue.doubleValue();
        if (currentValue.signum() > 0) {
            all.stream()
               .collect(Collectors.groupingBy(
                   i -> i.getType() != null ? i.getType() : "Other",
                   Collectors.summingDouble(i -> i.getCurrentValue() != null ? i.getCurrentValue()
                           : (i.getInvestedAmount() != null ? i.getInvestedAmount() : 0))
               ))
               .forEach((type, val) ->
                   allocation.put(type, Math.round((val / currentValueD) * 10000.0) / 100.0)
               );
        }

        PortfolioSummaryDTO summary = new PortfolioSummaryDTO();
        summary.setHoldings(holdings);
        summary.setTotalInvested(money(totalInvested));
        summary.setCurrentValue(money(currentValue));
        summary.setTotalPnl(money(totalPnl));
        summary.setTotalPnlPercent(totalPnlPct);
        summary.setAllocationByType(allocation);
        return summary;
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    // Money to the JSON edge: round to 2dp (half-up) and hand the frontend a double.
    private static double money(BigDecimal v) {
        return v.setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    // ── Auto-detect investments from bank transactions ────────────────────────

    /**
     * Scans transactions, identifies investment-related ones by narration
     * keywords, groups by instrument, and returns as unconfirmed suggestions.
     * Debits (purchases) add to the invested amount; credits from the same
     * instrument (redemptions, broker withdrawals) subtract, so the net
     * figure reflects what is actually still deployed. Nothing is saved —
     * the frontend presents them for user review.
     */
    @PreAuthorize("hasAuthority('READ_OWN_INVESTMENTS')")
    public List<InvestmentDTO> autoDetect() {
        User user = currentUser();
        List<Transaction> txns = txnRepo.findByUser(user);

        // name → {type, totalAmount, earliestDate}
        Map<String, DetectedEntry> grouped = new LinkedHashMap<>();

        for (Transaction t : txns) {
            if (t.getAmount() == null || t.getAmount() == 0) continue;
            boolean isDebit = t.getAmount() < 0;

            String raw = t.getMerchant() != null ? t.getMerchant() : "";
            String n   = raw.toLowerCase();

            // The user's own category is better evidence than any keyword: a
            // payment they filed under Investments is one, whatever the
            // narration looks like.
            boolean userSaysInvestment = "Investments".equalsIgnoreCase(t.getCategory());
            String type = detectType(n);
            if (type == null && !userSaysInvestment) continue;

            String name = type != null ? extractName(raw, n, type)
                    : com.fintwin.util.MerchantCategorizer.payeeOf(raw);
            if (name.isBlank()) continue;
            if (type == null) type = "Other";          // the user can link it to a fund or stock
            double amount = Math.abs(t.getAmount());
            LocalDate date = t.getDate();

            final String entryType = type;
            DetectedEntry entry = grouped.computeIfAbsent(name, k -> new DetectedEntry(entryType, isDebit ? date : null));
            // A keyword-known type beats the fallback when both appear under one payee
            if ("Other".equals(entry.type) && !"Other".equals(entryType)) entry.type = entryType;
            entry.totalAmount += isDebit ? amount : -amount;
            if (isDebit) {
                entry.payments++;
                // Kept one by one: seven payments to a broker can be seven
                // different stocks, and only the user knows which
                if (entry.breakdown.size() < MAX_BREAKDOWN && date != null) {
                    Map<String, Object> payment = new LinkedHashMap<>();
                    payment.put("date", date.toString());
                    payment.put("amount", Math.round(amount * 100.0) / 100.0);
                    entry.breakdown.add(payment);
                }
            }
            // Purchase date tracks the first outgoing payment, not redemptions.
            if (isDebit && date != null && (entry.earliestDate == null || date.isBefore(entry.earliestDate))) {
                entry.earliestDate = date;
            }
        }

        // Filter out names already saved in the portfolio
        Set<String> savedNames = repo.findByUser(user).stream()
                .map(i -> i.getName() != null ? i.getName().toLowerCase() : "")
                .collect(Collectors.toSet());

        List<InvestmentDTO> results = new ArrayList<>();
        for (Map.Entry<String, DetectedEntry> e : grouped.entrySet()) {
            if (savedNames.contains(e.getKey().toLowerCase())) continue;

            DetectedEntry d = e.getValue();
            if (d.totalAmount <= 0) continue; // fully redeemed — nothing left to import

            Investment inv = new Investment();
            inv.setName(e.getKey());
            inv.setType(d.type);
            inv.setInvestedAmount(Math.round(d.totalAmount * 100.0) / 100.0);
            inv.setCurrentValue(Math.round(d.totalAmount * 100.0) / 100.0); // default same as invested
            inv.setPurchaseDate(d.earliestDate);
            InvestmentDTO dto = InvestmentDTO.from(inv);
            dto.setPayments(d.payments);
            d.breakdown.sort(Comparator.comparing(m -> (String) m.get("date")));
            dto.setBreakdown(d.breakdown);
            results.add(dto);
        }

        return results;
    }

    // ── CRUD ──────────────────────────────────────────────────────────────────

    @PreAuthorize("hasAuthority('WRITE_OWN_INVESTMENTS')")
    @Audited(action = "WRITE", resource = "portfolio", description = "Investment holding added")
    public InvestmentDTO add(Investment investment) {
        // Prevent mass-assignment via a client-supplied id (would merge, not insert).
        investment.setId(null);
        investment.setUser(currentUser());
        applyIpoRules(investment);
        return InvestmentDTO.from(repo.save(investment));
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_INVESTMENTS')")
    @Audited(action = "WRITE", resource = "portfolio", description = "Investment holding updated")
    public InvestmentDTO update(Long id, Investment updated) {
        User user = currentUser();
        Investment inv = repo.findById(id).orElseThrow(() -> new NotFoundException("Not found"));
        if (!inv.getUser().getId().equals(user.getId())) throw new org.springframework.security.access.AccessDeniedException("Access denied");

        // PUT = full replace. The frontend always sends the complete form, so
        // null means "cleared" — the old null-means-ignore made it impossible
        // to remove a ticker/units/rate once set. Name, type and amount keep
        // the null guard: they are required fields a partial caller must not
        // blank out.
        if (updated.getName()           != null) inv.setName(updated.getName());
        if (updated.getType()           != null) inv.setType(updated.getType());
        if (updated.getInvestedAmount() != null) inv.setInvestedAmount(updated.getInvestedAmount());
        if (updated.getCurrentValue()   != null) inv.setCurrentValue(updated.getCurrentValue());
        inv.setPurchaseDate(updated.getPurchaseDate());
        inv.setTickerCode(updated.getTickerCode());
        inv.setUnits(updated.getUnits());
        inv.setInterestRate(updated.getInterestRate());
        inv.setNotes(updated.getNotes());
        inv.setIpoStatus(updated.getIpoStatus());
        inv.setIpoListingId(updated.getIpoListingId());
        applyIpoRules(inv);

        return InvestmentDTO.from(repo.save(inv));
    }

    public static final String IPO = "IPO";
    static final java.util.Set<String> IPO_STATUSES = java.util.Set.of("APPLIED", "ALLOTTED", "NOT_ALLOTTED", "LISTED");

    /**
     * An IPO application's money is blocked (APPLIED), becomes shares
     * (ALLOTTED, then LISTED with a live price), or comes back (NOT_ALLOTTED).
     * A refunded application must stop counting towards net worth.
     */
    static void applyIpoRules(Investment inv) {
        if (!IPO.equalsIgnoreCase(inv.getType())) {
            inv.setIpoStatus(null);
            inv.setIpoListingId(null);
            return;
        }
        inv.setType(IPO);
        String status = inv.getIpoStatus() == null ? "APPLIED" : inv.getIpoStatus().trim().toUpperCase();
        if (!IPO_STATUSES.contains(status)) {
            throw new com.fintwin.exception.BadRequestException(
                    "IPO status must be one of " + IPO_STATUSES);
        }
        inv.setIpoStatus(status);
        if (inv.getTickerCode() != null) {
            String t = inv.getTickerCode().trim().toUpperCase();
            inv.setTickerCode(t.isEmpty() ? null : t);
        }
        if ("NOT_ALLOTTED".equals(status)) {
            inv.setInvestedAmount(0.0);
            inv.setCurrentValue(0.0);
            inv.setUnits(null);
        } else if (!"LISTED".equals(status) || inv.getTickerCode() == null) {
            // Not trading yet: worth exactly what was paid or blocked
            inv.setCurrentValue(inv.getInvestedAmount());
        }
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_INVESTMENTS')")
    @Audited(action = "WRITE", resource = "portfolio", description = "Portfolio prices refreshed from market data")
    public PortfolioSummaryDTO refreshPrices() {
        User user = currentUser();
        List<Investment> all = repo.findByUser(user);
        if (all.isEmpty()) {
            PortfolioSummaryDTO empty = getSummary();
            empty.setPricesUpdated(0);
            return empty;
        }

        // Build request payload for AI service
        List<Map<String, Object>> payload = new ArrayList<>();
        for (Investment inv : all) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id",             inv.getId());
            m.put("type",           inv.getType());
            m.put("tickerCode",     inv.getTickerCode());
            m.put("units",          inv.getUnits());
            m.put("investedAmount", inv.getInvestedAmount());
            m.put("interestRate",   inv.getInterestRate());
            m.put("purchaseDate",   inv.getPurchaseDate() != null ? inv.getPurchaseDate().toString() : null);
            payload.add(m);
        }

        // null = the refresh call itself failed; a number = how many holdings
        // actually received a live price. The frontend surfaces both — silent
        // failure here previously looked identical to success.
        Integer pricesUpdated = null;
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            ResponseEntity<List<Map<String, Object>>> resp = aiRestTemplate.exchange(
                aiServiceUrl + "/market/prices",
                HttpMethod.POST,
                new HttpEntity<>(payload, headers),
                new ParameterizedTypeReference<>() {}
            );

            List<Map<String, Object>> updates = resp.getBody();
            if (updates != null) {
                Map<Long, Double> priceMap = new HashMap<>();
                for (Map<String, Object> u : updates) {
                    if (u.get("id") != null && u.get("currentValue") != null) {
                        priceMap.put(Long.valueOf(u.get("id").toString()),
                                     Double.valueOf(u.get("currentValue").toString()));
                    }
                }
                List<Investment> changed = new ArrayList<>();
                for (Investment inv : all) {
                    Double newVal = priceMap.get(inv.getId());
                    if (newVal != null) {
                        inv.setCurrentValue(newVal);
                        changed.add(inv);
                    }
                }
                repo.saveAll(changed);
                pricesUpdated = changed.size();
            }
        } catch (Exception e) {
            log.warn("Price refresh failed: {}", e.getMessage());
        }

        PortfolioSummaryDTO summary = getSummary();
        summary.setPricesUpdated(pricesUpdated);
        return summary;
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_INVESTMENTS')")
    @Audited(action = "DELETE", resource = "portfolio", description = "Investment holding deleted")
    public void delete(Long id) {
        User user = currentUser();
        Investment inv = repo.findById(id).orElseThrow(() -> new NotFoundException("Not found"));
        if (!inv.getUser().getId().equals(user.getId())) throw new ForbiddenException("Unauthorized");
        repo.delete(inv);
    }

    // ── Detection helpers ─────────────────────────────────────────────────────

    private String detectType(String n) {
        // Mutual Funds / SIPs
        if (n.contains("sip") || n.contains("mutual fund") || n.contains(" mf ") || n.contains("/mf/")
                || n.contains("folio") || n.contains("amfi") || n.contains("elss")
                || n.contains("ppfas") || n.contains("mirae") || n.contains("nippon")
                || n.contains("hdfc fund") || n.contains("sbi fund") || n.contains("axis fund")
                || n.contains("icici pru") || n.contains("kotak fund") || n.contains("dsp fund")
                || n.contains("franklin") || n.contains("aditya birla sun") || n.contains("uti fund")
                || n.contains("tata fund") || n.contains("parag parikh"))
            return "Mutual Fund";

        // Stock brokers
        if (n.contains("zerodha") || n.contains("groww") || n.contains("upstox")
                || n.contains("angel broking") || n.contains("angel one")
                || n.contains("kotak sec") || n.contains("hdfc sec") || n.contains("icici sec")
                || n.contains("icicidirect") || n.contains("sharekhan") || n.contains("motilal")
                || n.contains("5paisa") || n.contains("fyers") || n.contains("dhan ")
                || (n.contains("nse") && n.contains("pay")) || (n.contains("bse") && n.contains("pay")))
            return "Stocks";

        // PPF
        if (n.contains("ppf") || n.contains("public provident fund"))
            return "PPF";

        // NPS
        if (n.contains("nps ") || n.contains("national pension") || n.contains("pension system")
                || n.contains("nps-tier") || n.contains("nps/"))
            return "NPS";

        // Gold
        if (n.contains("sovereign gold") || n.contains(" sgb ") || n.contains("gold bond")
                || n.contains("gold etf") || n.contains("digital gold") || n.contains("mmtc-pamp"))
            return "Gold";

        // Fixed Deposits
        if ((n.contains("fd") && (n.contains("open") || n.contains("creat") || n.contains("book") || n.contains("place")))
                || n.contains("fixed deposit") || n.contains("term deposit"))
            return "Fixed Deposit";

        // Bonds
        if (n.contains("bond") || n.contains("debenture") || n.contains("rbi bond") || n.contains("54ec"))
            return "Bonds";

        // Crypto exchanges (after Gold, so "digital gold" bought via these
        // apps still classifies as Gold)
        if (n.contains("wazirx") || n.contains("coindcx") || n.contains("coinswitch")
                || n.contains("zebpay") || n.contains("binance") || n.contains("mudrex")
                || n.contains("giottus"))
            return "Crypto";

        return null;
    }

    private String extractName(String raw, String n, String type) {
        // For brokers, group all transactions to same broker under one entry
        if ("Stocks".equals(type)) {
            for (String broker : new String[]{"Zerodha", "Groww", "Upstox", "Angel One",
                    "Kotak Securities", "HDFC Securities", "ICICI Direct", "Sharekhan",
                    "Motilal Oswal", "5Paisa", "Fyers", "Dhan"}) {
                if (n.contains(broker.toLowerCase())) return broker + " Portfolio";
            }
            return "Stock Portfolio";
        }
        if ("Crypto".equals(type)) {
            for (String exchange : new String[]{"WazirX", "CoinDCX", "CoinSwitch",
                    "ZebPay", "Binance", "Mudrex", "Giottus"}) {
                if (n.contains(exchange.toLowerCase())) return exchange + " Portfolio";
            }
            return "Crypto Portfolio";
        }
        if ("PPF".equals(type))  return "PPF Account";
        if ("NPS".equals(type))  return "NPS Account";
        if ("Gold".equals(type)) {
            if (n.contains("sgb") || n.contains("sovereign")) return "Sovereign Gold Bond";
            if (n.contains("etf")) return "Gold ETF";
            return "Digital Gold";
        }

        // For MF and FD: clean up the narration to extract a meaningful name
        String cleaned = raw
                .replaceAll("(?i)(NACH|NEFT|IMPS|UPI|SIP|ACH|AUTO|MANDATE|DEBIT|DR|CR|\\d{6,})", "")
                .replaceAll("[^a-zA-Z0-9 .&-]", " ")
                .replaceAll("\\s+", " ")
                .trim();

        // Capitalise words
        String[] words = cleaned.split(" ");
        StringBuilder sb = new StringBuilder();
        for (String w : words) {
            if (w.length() > 1) {
                sb.append(Character.toUpperCase(w.charAt(0)))
                  .append(w.substring(1).toLowerCase())
                  .append(" ");
            }
        }
        String name = sb.toString().trim();
        return name.isEmpty() ? type + " Investment" : name;
    }

    private User currentUser() {
        return userRepo.findByEmail(SecurityUtils.getCurrentUserEmail()).orElseThrow();
    }

    /** More payments than this to one payee and listing them stops being useful. */
    private static final int MAX_BREAKDOWN = 100;

    private static class DetectedEntry {
        String    type;
        double    totalAmount;
        int       payments;
        LocalDate earliestDate;
        final List<Map<String, Object>> breakdown = new ArrayList<>();

        DetectedEntry(String type, LocalDate date) {
            this.type         = type;
            this.totalAmount  = 0;
            this.earliestDate = date;
        }
    }
}
