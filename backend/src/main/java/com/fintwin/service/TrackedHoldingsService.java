package com.fintwin.service;

import com.fintwin.dto.TrackedHoldingsDTO.*;
import com.fintwin.exception.NotFoundException;
import com.fintwin.model.*;
import com.fintwin.repository.*;
import com.fintwin.security.SecurityUtils;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

/**
 * SIPs, US holdings and the fund watchlist, stored per account instead of in
 * one browser's localStorage — so they follow the user to a new phone and
 * server-side jobs can read them.
 */
@Service
public class TrackedHoldingsService {

    /** Per-user, per-kind ceiling; far above real use, low enough to stop abuse. */
    static final int MAX_PER_KIND = 200;
    private static final Set<String> FREQUENCIES = Set.of("Monthly", "Quarterly");
    private static final BigDecimal MAX_AMOUNT = new BigDecimal("100000000"); // ₹10 crore / $100M

    private final SipPlanRepository sips;
    private final UsHoldingRepository usHoldings;
    private final FundWatchRepository watchlist;
    private final FinancialGoalRepository goals;
    private final UserRepository users;

    public TrackedHoldingsService(SipPlanRepository sips, UsHoldingRepository usHoldings,
                                  FundWatchRepository watchlist, FinancialGoalRepository goals,
                                  UserRepository users) {
        this.sips = sips;
        this.usHoldings = usHoldings;
        this.watchlist = watchlist;
        this.goals = goals;
        this.users = users;
    }

    private User currentUser() {
        return users.findByEmail(SecurityUtils.getCurrentUserEmail()).orElseThrow();
    }

    // ── SIPs ────────────────────────────────────────────────────────────────

    @PreAuthorize("hasAuthority('READ_OWN_INVESTMENTS')")
    @Transactional(readOnly = true)
    public List<Sip> listSips() {
        return sips.findByUserOrderByCreatedAtAsc(currentUser()).stream().map(Sip::from).toList();
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_INVESTMENTS')")
    @Transactional
    public Sip createSip(Sip dto) {
        User user = currentUser();
        if (sips.countByUser(user) >= MAX_PER_KIND) throw new IllegalArgumentException("Too many SIPs");
        FinancialGoal goal = ownGoal(dto.goalId(), user);
        // One SIP per goal: linking again replaces the existing link's details.
        SipPlan sip = goal == null ? new SipPlan() : sips.findByGoalIdAndUser(goal.getId(), user).orElseGet(SipPlan::new);
        sip.setUser(user);
        apply(sip, dto, goal);
        return Sip.from(sips.save(sip));
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_INVESTMENTS')")
    @Transactional
    public Sip updateSip(Long id, Sip dto) {
        User user = currentUser();
        SipPlan sip = sips.findByIdAndUser(id, user).orElseThrow(() -> new NotFoundException("SIP not found"));
        FinancialGoal goal = ownGoal(dto.goalId(), user);
        if (goal != null) {
            sips.findByGoalIdAndUser(goal.getId(), user)
                    .filter(other -> !other.getId().equals(id))
                    .ifPresent(other -> { other.setGoal(null); sips.saveAndFlush(other); });
        }
        apply(sip, dto, goal);
        return Sip.from(sips.save(sip));
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_INVESTMENTS')")
    @Transactional
    public void deleteSip(Long id) {
        User user = currentUser();
        sips.delete(sips.findByIdAndUser(id, user).orElseThrow(() -> new NotFoundException("SIP not found")));
    }

    private void apply(SipPlan sip, Sip dto, FinancialGoal goal) {
        String name = clean(dto.fundName(), 200);
        if (name == null && goal == null) throw new IllegalArgumentException("Fund name is required");
        sip.setFundName(name == null ? "" : name);
        sip.setAmount(positive(dto.amount(), "Amount"));
        String freq = dto.frequency() == null ? "Monthly" : dto.frequency();
        if (!FREQUENCIES.contains(freq)) throw new IllegalArgumentException("Frequency must be Monthly or Quarterly");
        sip.setFrequency(freq);
        sip.setNextDebitDate(dto.nextDebitDate());
        sip.setNotes(clean(dto.notes(), 500));
        sip.setGoal(goal);
    }

    private FinancialGoal ownGoal(Long goalId, User user) {
        if (goalId == null) return null;
        FinancialGoal goal = goals.findById(goalId).orElseThrow(() -> new NotFoundException("Goal not found"));
        // Someone else's goal reads as missing, so ids can't be probed.
        if (!goal.getUser().getId().equals(user.getId())) throw new NotFoundException("Goal not found");
        return goal;
    }

    // ── US holdings ─────────────────────────────────────────────────────────

    @PreAuthorize("hasAuthority('READ_OWN_INVESTMENTS')")
    @Transactional(readOnly = true)
    public List<UsStock> listUsHoldings() {
        return usHoldings.findByUserOrderByCreatedAtAsc(currentUser()).stream().map(UsStock::from).toList();
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_INVESTMENTS')")
    @Transactional
    public UsStock createUsHolding(UsStock dto) {
        User user = currentUser();
        if (usHoldings.countByUser(user) >= MAX_PER_KIND) throw new IllegalArgumentException("Too many holdings");
        return UsStock.from(usHoldings.save(toHolding(dto, user)));
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_INVESTMENTS')")
    @Transactional
    public void deleteUsHolding(Long id) {
        User user = currentUser();
        usHoldings.delete(usHoldings.findByIdAndUser(id, user).orElseThrow(() -> new NotFoundException("Holding not found")));
    }

    private UsHolding toHolding(UsStock dto, User user) {
        String name = clean(dto.name(), 200);
        if (name == null) throw new IllegalArgumentException("Name is required");
        String ticker = clean(dto.ticker(), 15);
        if (ticker != null) {
            ticker = ticker.toUpperCase(Locale.ROOT);
            if (!ticker.matches("[A-Z0-9.\\-^]+")) throw new IllegalArgumentException("Ticker looks wrong");
        }
        double units = dto.units() == null ? 0 : dto.units();
        if (!Double.isFinite(units) || units < 0 || units > 1e9) throw new IllegalArgumentException("Units look wrong");
        UsHolding h = new UsHolding();
        h.setUser(user);
        h.setName(name);
        h.setTicker(ticker);
        h.setUnits(units);
        h.setBuyPrice(positive(dto.buyPrice(), "Buy price"));
        h.setBuyDate(dto.buyDate());
        return h;
    }

    // ── Fund watchlist ──────────────────────────────────────────────────────

    @PreAuthorize("hasAuthority('READ_OWN_INVESTMENTS')")
    @Transactional(readOnly = true)
    public List<WatchedFund> listWatchlist() {
        return watchlist.findByUserOrderByCreatedAtAsc(currentUser()).stream().map(WatchedFund::from).toList();
    }

    /** Idempotent: watching a fund twice keeps one row. */
    @PreAuthorize("hasAuthority('WRITE_OWN_INVESTMENTS')")
    @Transactional
    public WatchedFund watch(WatchedFund dto) {
        User user = currentUser();
        String code = schemeCode(dto.schemeCode());
        var existing = watchlist.findByUserAndSchemeCode(user, code);
        if (existing.isPresent()) return WatchedFund.from(existing.get());
        if (watchlist.countByUser(user) >= MAX_PER_KIND) throw new IllegalArgumentException("Watchlist is full");
        String name = clean(dto.schemeName(), 300);
        if (name == null) throw new IllegalArgumentException("Scheme name is required");
        FundWatch f = new FundWatch();
        f.setUser(user);
        f.setSchemeCode(code);
        f.setSchemeName(name);
        return WatchedFund.from(watchlist.save(f));
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_INVESTMENTS')")
    @Transactional
    public void unwatch(String schemeCode) {
        User user = currentUser();
        watchlist.findByUserAndSchemeCode(user, schemeCode(schemeCode)).ifPresent(watchlist::delete);
    }

    private static String schemeCode(Object raw) {
        String code = raw == null ? "" : raw.toString().trim();
        if (!code.matches("\\d{1,20}")) throw new IllegalArgumentException("Scheme code looks wrong");
        return code;
    }

    // ── One-time move from the device ───────────────────────────────────────

    /**
     * Moves what one browser had saved into the account. Safe to send twice:
     * rows that already exist are matched and skipped, and bad rows (old
     * localStorage can hold anything) are skipped rather than failing the lot.
     */
    @PreAuthorize("hasAuthority('WRITE_OWN_INVESTMENTS')")
    @Transactional
    public ImportResult importFromDevice(DeviceImport body) {
        User user = currentUser();
        int sipCount = 0, usCount = 0, watchCount = 0, linkCount = 0, skipped = 0;

        List<SipPlan> mySips = new java.util.ArrayList<>(sips.findByUserOrderByCreatedAtAsc(user));
        for (Sip s : nullSafe(body.sips())) {
            try {
                if (mySips.stream().anyMatch(e -> sameSip(e, s.fundName(), s.amount(), s.frequency()))) continue;
                if (mySips.size() >= MAX_PER_KIND) { skipped++; continue; }
                SipPlan sip = new SipPlan();
                sip.setUser(user);
                apply(sip, new Sip(null, s.fundName(), s.amount(), s.frequency(), s.nextDebitDate(), s.notes(), null), null);
                mySips.add(sips.save(sip));
                sipCount++;
            } catch (RuntimeException e) { skipped++; }
        }

        for (GoalSipLink link : nullSafe(body.goalSipLinks())) {
            try {
                FinancialGoal goal = ownGoal(link.goalId(), user);
                if (goal == null || sips.findByGoalIdAndUser(goal.getId(), user).isPresent()) continue;
                // A link that describes a SIP already tracked is the same SIP: link it.
                SipPlan sip = mySips.stream()
                        .filter(e -> e.getGoal() == null && sameSip(e, link.fundName(), link.monthlyAmount(), "Monthly"))
                        .findFirst().orElse(null);
                if (sip == null) {
                    if (mySips.size() >= MAX_PER_KIND) { skipped++; continue; }
                    sip = new SipPlan();
                    sip.setUser(user);
                    apply(sip, new Sip(null, link.fundName(), link.monthlyAmount(), "Monthly", null, null, goal.getId()), goal);
                    mySips.add(sip);
                } else {
                    sip.setGoal(goal);
                }
                sips.save(sip);
                linkCount++;
            } catch (RuntimeException e) { skipped++; }
        }

        List<UsHolding> myUs = new java.util.ArrayList<>(usHoldings.findByUserOrderByCreatedAtAsc(user));
        for (UsStock u : nullSafe(body.usHoldings())) {
            try {
                UsHolding h = toHolding(u, user);
                boolean dup = myUs.stream().anyMatch(e -> e.getName().equalsIgnoreCase(h.getName())
                        && Objects.equals(e.getTicker(), h.getTicker())
                        && Objects.equals(e.getUnits(), h.getUnits())
                        && e.getBuyPrice().compareTo(h.getBuyPrice()) == 0);
                if (dup) continue;
                if (myUs.size() >= MAX_PER_KIND) { skipped++; continue; }
                myUs.add(usHoldings.save(h));
                usCount++;
            } catch (RuntimeException e) { skipped++; }
        }

        for (WatchedFund f : nullSafe(body.watchlist())) {
            try {
                boolean had = watchlist.findByUserAndSchemeCode(user, schemeCode(f.schemeCode())).isPresent();
                watch(f);
                if (!had) watchCount++;
            } catch (RuntimeException e) { skipped++; }
        }

        return new ImportResult(sipCount, usCount, watchCount, linkCount, skipped);
    }

    private static boolean sameSip(SipPlan e, String fundName, BigDecimal amount, String frequency) {
        String name = fundName == null ? "" : fundName.trim();
        return e.getFundName().equalsIgnoreCase(name)
                && amount != null && e.getAmount().compareTo(amount) == 0
                && e.getFrequency().equals(frequency == null ? "Monthly" : frequency);
    }

    private static <T> List<T> nullSafe(List<T> list) {
        return list == null ? List.of() : list.stream().filter(Objects::nonNull).limit(MAX_PER_KIND).toList();
    }

    private static String clean(String s, int max) {
        if (s == null) return null;
        String t = s.strip();
        if (t.isEmpty()) return null;
        if (t.length() > max) throw new IllegalArgumentException("Text is too long");
        return t;
    }

    private static BigDecimal positive(BigDecimal v, String what) {
        if (v == null || v.signum() <= 0 || v.compareTo(MAX_AMOUNT) > 0)
            throw new IllegalArgumentException(what + " must be a positive number");
        return v;
    }
}
