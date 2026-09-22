package com.fintwin.service;

import com.fintwin.dto.InvestmentDTO;
import com.fintwin.exception.BadRequestException;
import com.fintwin.exception.NotFoundException;
import com.fintwin.model.Investment;
import com.fintwin.model.User;
import com.fintwin.repository.InvestmentRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Turns "I invested ₹15,000" into a real holding.
 *
 * Onboarding asks only for an amount, so the portfolio shows a sum with
 * nothing behind it and a value that can never move. Given what it went into
 * and when, the units follow: amount ÷ the price that day. Those units at
 * today's price are what it's worth now.
 */
@Service
public class HoldingLinkService {

    public enum Kind { STOCK, FUND }

    /** What a sum bought and what it's worth today. */
    public record Valuation(Kind kind, String symbol, LocalDate purchaseDate, double purchasePrice,
                            double units, double currentPrice, double amount) {
        public double currentValue() { return round2(units * currentPrice); }
        public double gain() { return round2(currentValue() - amount); }
        public double gainPct() { return amount > 0 ? round2(gain() / amount * 100) : 0; }

        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("kind", kind.name());
            m.put("symbol", symbol);
            m.put("amount", amount);
            m.put("purchaseDate", purchaseDate);
            m.put("purchasePrice", purchasePrice);
            m.put("units", units);
            m.put("currentPrice", currentPrice);
            m.put("currentValue", currentValue());
            m.put("gain", gain());
            m.put("gainPct", gainPct());
            return m;
        }
    }

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private final DiscoverService market;
    private final InvestmentRepository investments;
    private final UserRepository users;

    public HoldingLinkService(DiscoverService market, InvestmentRepository investments, UserRepository users) {
        this.market = market;
        this.investments = investments;
        this.users = users;
    }

    /**
     * Units bought: exact when the user knows them, otherwise amount ÷ price.
     * Fund units are allotted to three decimals; shares are shown to four so
     * the value matches the amount — the user can enter the whole-share count
     * their broker shows instead.
     */
    static double units(Kind kind, double amount, double purchasePrice, Double knownUnits) {
        if (knownUnits != null && knownUnits > 0) return knownUnits;
        int scale = kind == Kind.FUND ? 3 : 4;
        return BigDecimal.valueOf(amount).divide(BigDecimal.valueOf(purchasePrice), scale, RoundingMode.HALF_UP)
                .doubleValue();
    }

    @PreAuthorize("hasAuthority('READ_OWN_INVESTMENTS')")
    public Map<String, Object> preview(String kind, String symbol, LocalDate date, Double amount, Double units) {
        return value(parseKind(kind), symbol, date, amount, units).toMap();
    }

    /** Re-points an existing holding (the onboarding sum) at what it really is. */
    @PreAuthorize("hasAuthority('WRITE_OWN_INVESTMENTS')")
    @Transactional
    public InvestmentDTO link(Long id, String kindRaw, String symbol, String name,
                              LocalDate date, Double amount, Double units) {
        User user = users.findByEmail(SecurityUtils.getCurrentUserEmail())
                .orElseThrow(() -> new NotFoundException("User not found"));
        Investment inv = investments.findById(id).orElseThrow(() -> new NotFoundException("Holding not found"));
        if (!inv.getUser().getId().equals(user.getId())) throw new AccessDeniedException("Access denied");

        Kind kind = parseKind(kindRaw);
        Valuation v = value(kind, symbol, date, amount, units);

        inv.setType(kind == Kind.STOCK ? "Stocks" : "Mutual Fund");
        if (name != null && !name.isBlank()) inv.setName(name.trim().length() > 200 ? name.trim().substring(0, 200) : name.trim());
        inv.setTickerCode(v.symbol());
        inv.setUnits(v.units());
        inv.setPurchaseDate(date);
        inv.setInvestedAmount(v.amount());
        inv.setCurrentValue(v.currentValue());
        inv.setIpoStatus(null);
        inv.setIpoListingId(null);
        return InvestmentDTO.from(investments.save(inv));
    }

    private Valuation value(Kind kind, String symbolRaw, LocalDate date, Double amount, Double units) {
        LocalDate today = LocalDate.now(IST);
        if (date == null) throw new BadRequestException("Choose the date you invested");
        if (date.isAfter(today)) throw new BadRequestException("The date can't be in the future");
        if (date.isBefore(LocalDate.of(1990, 1, 1))) throw new BadRequestException("That date is too far back");
        if (amount == null || amount <= 0) throw new BadRequestException("Enter the amount you invested");
        if (units != null && units < 0) throw new BadRequestException("Units can't be negative");
        String symbol = symbolRaw == null ? "" : symbolRaw.trim().toUpperCase();

        double purchasePrice, currentPrice;
        if (kind == Kind.FUND) {
            if (!symbol.matches("\\d{1,10}")) throw new BadRequestException("Choose a fund from the search");
            purchasePrice = number(market.fundNavOn(symbol, date).get("nav"));
            currentPrice = number(market.fundLatest(symbol).get("nav"));
        } else {
            if (!symbol.matches("[A-Z0-9&._-]{1,40}")) throw new BadRequestException("Choose a stock from the search");
            Map<String, Object> then = market.stockPriceOn(symbol, date);
            purchasePrice = number(then.get("price"));
            symbol = String.valueOf(then.getOrDefault("symbol", symbol));
            currentPrice = number(market.stockPriceOn(symbol, today).get("price"));
        }
        if (purchasePrice <= 0 || currentPrice <= 0) throw new BadRequestException("No usable price for that date");

        return new Valuation(kind, symbol, date, purchasePrice, units(kind, amount, purchasePrice, units),
                currentPrice, round2(amount));
    }

    private static Kind parseKind(String raw) {
        try {
            return Kind.valueOf(String.valueOf(raw).trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Kind must be STOCK or FUND");
        }
    }

    private static double number(Object o) {
        if (o instanceof Number n) return n.doubleValue();
        try {
            return Double.parseDouble(String.valueOf(o));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    static double round2(double v) {
        return BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }
}
