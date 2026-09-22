package com.fintwin.service;

import com.fintwin.exception.BadRequestException;
import com.fintwin.exception.NotFoundException;
import com.fintwin.model.IpoListing;
import com.fintwin.repository.IpoListingRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.*;

/**
 * The IPO catalog: admins maintain it, users browse it on Discover.
 *
 * Status comes from the dates, so nobody has to remember to flip it:
 * UPCOMING until it opens, OPEN while bidding, CLOSED between close and
 * listing, LISTED from listing day — shown for 90 days with its live price
 * against the issue price.
 */
@Service
public class IpoService {

    private static final Logger log = LoggerFactory.getLogger(IpoService.class);
    static final int LISTED_SHOWN_FOR_DAYS = 90;

    public enum Status { OPEN, UPCOMING, CLOSED, LISTED }

    private final IpoListingRepository repo;
    private final DiscoverService discover;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired
    public IpoService(IpoListingRepository repo, DiscoverService discover) {
        this(repo, discover, Clock.system(ZoneId.of("Asia/Kolkata")));
    }

    IpoService(IpoListingRepository repo, DiscoverService discover, Clock clock) {
        this.repo = repo;
        this.discover = discover;
        this.clock = clock;
    }

    static Status statusOf(IpoListing ipo, LocalDate today) {
        if (ipo.getListingDate() != null && !ipo.getListingDate().isAfter(today)) return Status.LISTED;
        if (ipo.getCloseDate() != null && ipo.getCloseDate().isBefore(today)) return Status.CLOSED;
        if (ipo.getOpenDate() != null && !ipo.getOpenDate().isAfter(today)) return Status.OPEN;
        return Status.UPCOMING;
    }

    /** What users see: open first, then upcoming (soonest), closed, recently listed. */
    @PreAuthorize("hasAuthority('READ_OWN_INVESTMENTS')")
    public List<Map<String, Object>> forUsers() {
        LocalDate today = LocalDate.now(clock);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (IpoListing ipo : repo.findAll()) {
            Status status = statusOf(ipo, today);
            if (status == Status.LISTED
                    && ipo.getListingDate().isBefore(today.minusDays(LISTED_SHOWN_FOR_DAYS))) continue;
            Map<String, Object> m = view(ipo);
            m.put("status", status.name());
            rows.add(m);
        }
        rows.sort(Comparator
                .comparing((Map<String, Object> m) -> Status.valueOf((String) m.get("status")).ordinal())
                .thenComparing(m -> sortDate(m), Comparator.nullsLast(Comparator.naturalOrder())));
        addLivePrices(rows);
        return rows;
    }

    private static LocalDate sortDate(Map<String, Object> m) {
        String status = (String) m.get("status");
        // listed: most recent first, via a negated epoch day
        if ("LISTED".equals(status) && m.get("listingDate") != null) {
            return LocalDate.ofEpochDay(-((LocalDate) m.get("listingDate")).toEpochDay());
        }
        return (LocalDate) m.get("OPEN".equals(status) ? "closeDate" : "openDate");
    }

    private void addLivePrices(List<Map<String, Object>> rows) {
        List<String> symbols = rows.stream()
                .filter(m -> "LISTED".equals(m.get("status")) && m.get("symbol") != null)
                .map(m -> (String) m.get("symbol")).distinct().toList();
        if (symbols.isEmpty()) return;
        Map<String, Double> prices = new HashMap<>();
        try {
            for (Map<String, Object> q : discover.quotes(symbols)) {
                if (q.get("price") instanceof Number p) {
                    String sym = String.valueOf(q.get("symbol")).replaceAll("\\.(NS|BO)$", "");
                    prices.put(sym, p.doubleValue());
                }
            }
        } catch (Exception e) {
            log.info("IPO live prices unavailable: {}", e.getMessage());
            return;
        }
        for (Map<String, Object> m : rows) {
            Double price = m.get("symbol") == null ? null
                    : prices.get(((String) m.get("symbol")).replaceAll("\\.(NS|BO)$", ""));
            if (price == null) continue;
            m.put("currentPrice", price);
            if (m.get("issuePrice") instanceof BigDecimal issue && issue.signum() > 0) {
                m.put("gainPct", BigDecimal.valueOf(price).subtract(issue)
                        .multiply(BigDecimal.valueOf(100)).divide(issue, 2, RoundingMode.HALF_UP).doubleValue());
            }
        }
    }

    static Map<String, Object> view(IpoListing ipo) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", ipo.getId());
        m.put("name", ipo.getName());
        m.put("symbol", ipo.getSymbol());
        m.put("category", ipo.getCategory());
        m.put("priceBandLow", ipo.getPriceBandLow());
        m.put("priceBandHigh", ipo.getPriceBandHigh());
        m.put("issuePrice", ipo.getIssuePrice());
        m.put("lotSize", ipo.getLotSize());
        m.put("openDate", ipo.getOpenDate());
        m.put("closeDate", ipo.getCloseDate());
        m.put("allotmentDate", ipo.getAllotmentDate());
        m.put("listingDate", ipo.getListingDate());
        m.put("notes", ipo.getNotes());
        // Smallest application: one lot at the final price, or the top of the band
        BigDecimal price = ipo.getIssuePrice() != null ? ipo.getIssuePrice() : ipo.getPriceBandHigh();
        m.put("minInvestment", price != null && ipo.getLotSize() != null
                ? price.multiply(BigDecimal.valueOf(ipo.getLotSize())) : null);
        return m;
    }

    // ── Admin ────────────────────────────────────────────────────────────────

    @PreAuthorize("hasAuthority('MANAGE_SYSTEM_CONFIG')")
    public List<Map<String, Object>> all() {
        LocalDate today = LocalDate.now(clock);
        return repo.findAll().stream()
                .sorted(Comparator.comparing(IpoListing::getOpenDate, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(ipo -> { Map<String, Object> m = view(ipo); m.put("status", statusOf(ipo, today).name()); return m; })
                .toList();
    }

    @PreAuthorize("hasAuthority('MANAGE_SYSTEM_CONFIG')")
    @Transactional
    public Map<String, Object> save(Long id, IpoListing input) {
        IpoListing ipo = id == null ? new IpoListing()
                : repo.findById(id).orElseThrow(() -> new NotFoundException("IPO not found"));
        validate(input);
        ipo.setName(input.getName().trim());
        ipo.setSymbol(input.getSymbol() == null || input.getSymbol().isBlank() ? null
                : input.getSymbol().trim().toUpperCase().replaceAll("\\.(NS|BO)$", ""));
        ipo.setCategory("SME".equalsIgnoreCase(input.getCategory()) ? "SME" : "Mainboard");
        ipo.setPriceBandLow(input.getPriceBandLow());
        ipo.setPriceBandHigh(input.getPriceBandHigh());
        ipo.setIssuePrice(input.getIssuePrice());
        ipo.setLotSize(input.getLotSize());
        ipo.setOpenDate(input.getOpenDate());
        ipo.setCloseDate(input.getCloseDate());
        ipo.setAllotmentDate(input.getAllotmentDate());
        ipo.setListingDate(input.getListingDate());
        ipo.setNotes(input.getNotes());
        ipo.setUpdatedAt(LocalDateTime.now(clock));
        IpoListing saved = repo.save(ipo);
        Map<String, Object> m = view(saved);
        m.put("status", statusOf(saved, LocalDate.now(clock)).name());
        return m;
    }

    @PreAuthorize("hasAuthority('MANAGE_SYSTEM_CONFIG')")
    @Transactional
    public void delete(Long id) {
        if (!repo.existsById(id)) throw new NotFoundException("IPO not found");
        repo.deleteById(id);
    }

    static void validate(IpoListing in) {
        if (in.getName() == null || in.getName().isBlank()) throw new BadRequestException("Name is required");
        if (in.getLotSize() != null && in.getLotSize() <= 0) throw new BadRequestException("Lot size must be positive");
        for (BigDecimal p : Arrays.asList(in.getPriceBandLow(), in.getPriceBandHigh(), in.getIssuePrice())) {
            if (p != null && p.signum() <= 0) throw new BadRequestException("Prices must be positive");
        }
        if (in.getPriceBandLow() != null && in.getPriceBandHigh() != null
                && in.getPriceBandLow().compareTo(in.getPriceBandHigh()) > 0) {
            throw new BadRequestException("Price band low can't be above high");
        }
        LocalDate prev = null;
        String prevName = null;
        String[] names = {"open", "close", "allotment", "listing"};
        LocalDate[] dates = {in.getOpenDate(), in.getCloseDate(), in.getAllotmentDate(), in.getListingDate()};
        for (int i = 0; i < dates.length; i++) {
            if (dates[i] == null) continue;
            if (prev != null && dates[i].isBefore(prev)) {
                throw new BadRequestException("The " + names[i] + " date can't be before the " + prevName + " date");
            }
            prev = dates[i];
            prevName = names[i];
        }
    }
}
