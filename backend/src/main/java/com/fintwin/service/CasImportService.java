package com.fintwin.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fintwin.audit.Audited;
import com.fintwin.exception.BadRequestException;
import com.fintwin.model.HoldingTransaction;
import com.fintwin.model.Investment;
import com.fintwin.model.User;
import com.fintwin.repository.HoldingTransactionRepository;
import com.fintwin.repository.InvestmentRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.util.*;

/**
 * Brings every holding in a CAS into the portfolio at once: mutual funds
 * from a CAMS/KFintech statement, shares and demat funds from NSDL/CDSL.
 *
 * A holding is the same one next time when its ISIN and folio match, so
 * importing a newer statement updates units and value instead of adding a
 * copy. A fund the user added by hand with the same scheme code is taken
 * over rather than duplicated. Transactions are merged, never replaced, so
 * a statement covering a shorter period doesn't lose older history.
 */
@Service
public class CasImportService {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Txn(LocalDate date, String type, Double amount, Double units, Double nav) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Holding(String kind, String name, String isin, String amfi, String ticker, String folio, String assetClass,
                          Double units, Double nav, LocalDate navDate, Double value, Double cost,
                          List<Txn> transactions) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Statement(String source, boolean detailed, LocalDate statementTo, List<Holding> holdings) {}

    public record Result(int added, int updated, int transactions, String source, LocalDate statementTo) {}

    static final Set<String> SOURCES = Set.of("CAMS", "KFINTECH", "NSDL", "CDSL");

    private final DocumentExtractService documents;
    private final InvestmentRepository investments;
    private final HoldingTransactionRepository txns;
    private final UserRepository users;
    private final ObjectMapper mapper = new ObjectMapper()
            .findAndRegisterModules()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    public CasImportService(DocumentExtractService documents, InvestmentRepository investments,
                            HoldingTransactionRepository txns, UserRepository users) {
        this.documents = documents;
        this.investments = investments;
        this.txns = txns;
        this.users = users;
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_INVESTMENTS')")
    @Audited(action = "WRITE", resource = "portfolio", description = "Holdings imported from a CAS statement")
    @Transactional
    public Result importCas(MultipartFile file, String password) {
        Statement statement = mapper.convertValue(documents.readCas(file, password), Statement.class);
        User user = users.findByEmail(SecurityUtils.getCurrentUserEmail()).orElseThrow();
        return apply(user, statement);
    }

    @Transactional
    public Result apply(User user, Statement s) {
        String source = s.source() == null ? null : s.source().toUpperCase(Locale.ROOT);
        if (!SOURCES.contains(source) || s.holdings() == null || s.holdings().isEmpty())
            throw new BadRequestException("No holdings were found in this statement.");

        List<Investment> mine = new ArrayList<>(investments.findByUser(user));
        int added = 0, updated = 0, newTxns = 0;
        for (Holding h : s.holdings()) {
            if (h.isin() == null || h.isin().isBlank()) continue;
            String type = "stock".equals(h.kind()) ? "Stocks" : "Mutual Fund";
            String ticker = "stock".equals(h.kind()) ? h.ticker() : h.amfi();
            double units = h.units() == null ? 0 : h.units();

            Investment inv = find(mine, h, type, ticker);
            if (inv == null) {
                if (units <= 0) continue;               // fully sold before this statement: nothing to track
                inv = new Investment();
                inv.setUser(user);
                inv.setName(h.name());
                mine.add(inv);
                added++;
            } else {
                updated++;
            }
            inv.setType(type);
            inv.setIsin(h.isin());
            inv.setFolioTail(h.folio());
            inv.setSource(source);
            String cls = "stock".equals(h.kind()) ? "EQUITY" : h.assetClass();
            if (cls != null && !cls.isBlank()) inv.setAssetClass(cls.toUpperCase(Locale.ROOT).substring(0, Math.min(20, cls.length())));
            if (ticker != null && !ticker.isBlank()) inv.setTickerCode(ticker);
            inv.setUnits(units);
            inv.setUnitsAsOf(h.navDate() != null ? h.navDate() : s.statementTo());
            inv.setCurrentValue(h.value() == null ? 0.0 : h.value());
            // Demat statements carry no cost: keep what the user entered, else the value
            if (h.cost() != null) inv.setInvestedAmount(h.cost());
            else if (inv.getInvestedAmount() == null) inv.setInvestedAmount(inv.getCurrentValue());
            List<Txn> lines = h.transactions() == null ? List.of() : h.transactions();
            LocalDate first = firstDate(lines);
            if (first != null && (inv.getPurchaseDate() == null || first.isBefore(inv.getPurchaseDate())))
                inv.setPurchaseDate(first);
            Investment saved = investments.save(inv);
            newTxns += merge(saved, lines);
        }
        return new Result(added, updated, newTxns, source, s.statementTo());
    }

    /** The same holding as last time (ISIN + folio), else a hand-added one with the same code and no ISIN. */
    private static Investment find(List<Investment> mine, Holding h, String type, String ticker) {
        for (Investment i : mine)
            if (h.isin().equalsIgnoreCase(Objects.toString(i.getIsin(), ""))
                    && Objects.equals(i.getFolioTail(), h.folio())) return i;
        if (ticker == null || ticker.isBlank()) return null;
        for (Investment i : mine)
            if (i.getIsin() == null && type.equals(i.getType()) && ticker.equalsIgnoreCase(Objects.toString(i.getTickerCode(), "")))
                return i;
        return null;
    }

    private static LocalDate firstDate(List<Txn> lines) {
        return lines.stream().map(Txn::date).filter(Objects::nonNull).min(Comparator.naturalOrder()).orElse(null);
    }

    private int merge(Investment inv, List<Txn> lines) {
        if (lines.isEmpty()) return 0;
        Set<String> have = new HashSet<>();
        for (HoldingTransaction t : txns.findByInvestmentOrderByDateAsc(inv))
            have.add(key(t.getDate(), t.getKind(), t.getAmount(), t.getUnits()));
        List<HoldingTransaction> fresh = new ArrayList<>();
        for (Txn t : lines) {
            if (t.date() == null || t.type() == null) continue;
            String kind = t.type().length() > 30 ? t.type().substring(0, 30) : t.type();
            if (have.add(key(t.date(), kind, t.amount(), t.units())))
                fresh.add(new HoldingTransaction(inv, t.date(), kind, t.amount(), t.units(), t.nav()));
        }
        txns.saveAll(fresh);
        return fresh.size();
    }

    private static String key(LocalDate d, String kind, Double amount, Double units) {
        return d + "|" + kind + "|" + (amount == null ? "" : Math.round(amount * 100))
                + "|" + (units == null ? "" : Math.round(units * 1000));
    }
}
