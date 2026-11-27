package com.fintwin.util;

import com.fintwin.model.HoldingTransaction;
import com.fintwin.model.Investment;

import java.time.LocalDate;
import java.util.*;

/**
 * How much long-term gain on equity could be booked tax-free this financial
 * year. Since 23 July 2024 the first ₹1.25 lakh a year of long-term gains on
 * listed shares and equity funds (held over 12 months) is tax-free; selling
 * and buying back units that have gained uses that allowance and resets
 * their cost, so less is taxed later.
 *
 * Works lot by lot, first in first out, from the statement's transactions.
 * Holdings whose transactions don't add up to the units held are left out
 * rather than guessed, and so is anything bought before 1 Feb 2018 (the
 * grandfathered cost needs the 31 Jan 2018 price, which a CAS doesn't give).
 * An estimate for the user to check, not a tax computation.
 */
public final class TaxHarvest {

    private TaxHarvest() {}

    public static final double EXEMPTION = 125_000;
    static final LocalDate GRANDFATHER_CUTOFF = LocalDate.of(2018, 2, 1);
    static final double UNIT_TOLERANCE = 0.01;
    static final Set<String> BUYS = Set.of("PURCHASE", "PURCHASE_SIP", "SWITCH_IN", "SWITCH_IN_MERGER", "DIVIDEND_REINVEST");
    static final Set<String> SELLS = Set.of("REDEMPTION", "SWITCH_OUT", "SWITCH_OUT_MERGER");

    public record Line(Long id, String name, double gain, double units) {}

    public record Result(LocalDate fyStart, LocalDate fyEnd, double realisedThisYear, double unrealisedLongTerm,
                         double harvestable, List<Line> holdings, int leftOut) {}

    private static final class Lot {
        final LocalDate date; double units; final double costPerUnit;
        Lot(LocalDate date, double units, double costPerUnit) { this.date = date; this.units = units; this.costPerUnit = costPerUnit; }
    }

    public static LocalDate fyStart(LocalDate today) {
        LocalDate april = LocalDate.of(today.getYear(), 4, 1);
        return today.isBefore(april) ? april.minusYears(1) : april;
    }

    static boolean longTerm(LocalDate bought, LocalDate on) {
        return on.isAfter(bought.plusYears(1));   // held for more than 12 months
    }

    public static boolean equity(Investment i) {
        return "EQUITY".equalsIgnoreCase(i.getAssetClass()) || "Stocks".equals(i.getType());
    }

    public static Result of(List<Investment> holdings, Map<Long, List<HoldingTransaction>> txns, LocalDate today) {
        LocalDate fy = fyStart(today);
        double realised = 0, unrealised = 0;
        int leftOut = 0;
        List<Line> lines = new ArrayList<>();
        for (Investment inv : holdings) {
            if (!equity(inv)) continue;
            List<HoldingTransaction> ts = txns.getOrDefault(inv.getId(), List.of());
            if (ts.isEmpty()) continue;
            Deque<Lot> lots = new ArrayDeque<>();
            double realisedHere = 0;
            boolean ok = true;
            for (HoldingTransaction t : ts) {
                if (t.getUnits() == null || t.getDate() == null) continue;
                double u = Math.abs(t.getUnits());
                if (BUYS.contains(t.getKind())) {
                    if (t.getDate().isBefore(GRANDFATHER_CUTOFF)) { ok = false; break; }
                    double cost = t.getAmount() != null ? Math.abs(t.getAmount()) : (t.getNav() == null ? 0 : u * t.getNav());
                    if (u > 0) lots.add(new Lot(t.getDate(), u, cost / u));
                } else if (SELLS.contains(t.getKind())) {
                    double price = t.getAmount() != null && u > 0 ? Math.abs(t.getAmount()) / u : (t.getNav() == null ? 0 : t.getNav());
                    double left = u;
                    while (left > 1e-9 && !lots.isEmpty()) {
                        Lot l = lots.peekFirst();
                        double take = Math.min(left, l.units);
                        if (!t.getDate().isBefore(fy) && longTerm(l.date, t.getDate()))
                            realisedHere += take * (price - l.costPerUnit);
                        l.units -= take;
                        left -= take;
                        if (l.units <= 1e-9) lots.pollFirst();
                    }
                    if (left > 1e-6) { ok = false; break; }   // sold more than the history shows bought
                }
            }
            double held = lots.stream().mapToDouble(l -> l.units).sum();
            Double units = inv.getUnits();
            if (!ok || units == null || units <= 0 || Math.abs(held - units) > Math.max(UNIT_TOLERANCE * units, 0.01)) {
                leftOut++;
                continue;
            }
            realised += realisedHere;
            double nav = (inv.getCurrentValue() == null ? 0 : inv.getCurrentValue()) / units;
            double gain = 0, ltUnits = 0;
            for (Lot l : lots) {
                if (!longTerm(l.date, today)) continue;
                double g = l.units * (nav - l.costPerUnit);
                if (g > 0) { gain += g; ltUnits += l.units; }
            }
            if (gain > 0) {
                unrealised += gain;
                lines.add(new Line(inv.getId(), inv.getName(), round(gain), Math.round(ltUnits * 1000) / 1000.0));
            }
        }
        lines.sort(Comparator.comparingDouble(Line::gain).reversed());
        double room = Math.max(0, EXEMPTION - Math.max(0, realised));
        return new Result(fy, fy.plusYears(1).minusDays(1), round(realised), round(unrealised),
                round(Math.min(unrealised, room)), lines, leftOut);
    }

    private static double round(double d) { return Math.round(d * 100.0) / 100.0; }
}
