package com.fintwin.util;

import com.fintwin.model.Investment;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Facts about a portfolio worth knowing, in the spirit of Zerodha's nudges:
 * each says what is true and what it costs, never which fund to buy.
 *
 *  - regular:   Regular plans, which pay a distributor out of the returns
 *  - one-big:   one holding carrying a large share of the money
 *  - unpriced:  funds or shares with nothing to price them by
 *  - stale:     units from a statement that's getting old
 *  - tax:       long-term gains that could be booked tax-free this year
 */
public final class PortfolioHealth {

    private PortfolioHealth() {}

    public record Check(String id, String tone, String title, String detail) {}

    /** The extra yearly cost of a Regular plan over its Direct twin: AMFI data puts most between these. */
    static final double REGULAR_LOW = 0.005, REGULAR_HIGH = 0.015;
    static final double ONE_BIG_SHARE = 0.25;
    static final int STALE_DAYS = 45;
    static final double TAX_WORTH_SAYING = 1_000;

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);

    public static List<Check> of(List<Investment> holdings, TaxHarvest.Result tax, LocalDate today) {
        List<Check> out = new ArrayList<>();
        double total = holdings.stream().mapToDouble(PortfolioHealth::value).sum();
        if (total <= 0) return out;

        List<Investment> regular = holdings.stream().filter(PortfolioHealth::isRegularPlan).toList();
        if (!regular.isEmpty()) {
            double v = regular.stream().mapToDouble(PortfolioHealth::value).sum();
            out.add(new Check("regular", "warn",
                    regular.size() == 1 ? regular.get(0).getName() + " is a Regular plan"
                            : regular.size() + " of your funds are Regular plans",
                    "Regular plans pay a distributor from your returns, usually 0.5–1.5% a year more than the same "
                            + "fund's Direct plan: about " + rupees(v * REGULAR_LOW) + "–" + rupees(v * REGULAR_HIGH)
                            + " a year on " + rupees(v) + ". Moving to Direct is a sale and a new purchase, "
                            + "so check the exit load and tax first."));
        }

        if (holdings.size() > 1) {
            Investment big = holdings.stream().max(Comparator.comparingDouble(PortfolioHealth::value)).orElseThrow();
            double share = value(big) / total;
            if (share >= ONE_BIG_SHARE && !isDiversifiedByNature(big)) {
                out.add(new Check("one-big", "info", big.getName() + " is " + Math.round(share * 100) + "% of your portfolio",
                        "If it falls 20%, your whole portfolio falls about " + Math.round(share * 20) + "%."));
            }
        }

        long unpriced = holdings.stream().filter(i -> ("Mutual Fund".equals(i.getType()) || "Stocks".equals(i.getType()))
                && (i.getTickerCode() == null || i.getTickerCode().isBlank())).count();
        if (unpriced > 0) {
            out.add(new Check("unpriced", "info",
                    unpriced == 1 ? "1 holding isn't linked to a fund or share" : unpriced + " holdings aren't linked to a fund or share",
                    "Their value stays at what you entered. Edit them and pick the fund or share so the price updates."));
        }

        holdings.stream().filter(i -> i.getSource() != null && i.getUnitsAsOf() != null)
                .map(Investment::getUnitsAsOf).min(LocalDate::compareTo)
                .filter(d -> d.plusDays(STALE_DAYS).isBefore(today))
                .ifPresent(d -> out.add(new Check("stale", "info", "Your statement is from " + d.format(DAY),
                        "Units bought or sold since then aren't here. Import a newer CAS to bring them in.")));

        if (tax != null && tax.harvestable() >= TAX_WORTH_SAYING) {
            out.add(new Check("tax", "good", "About " + rupees(tax.harvestable()) + " of gains could be booked tax-free",
                    "The first ₹1.25 lakh of long-term gains on equity each year is tax-free. Selling units held over "
                            + "a year and buying them back uses that before " + tax.fyEnd().format(DAY)
                            + " and lowers the tax when you sell for good. An estimate from your statement: check "
                            + "the exit load, and what you've already sold this year elsewhere."));
        }
        return out;
    }

    static boolean isRegularPlan(Investment i) {
        if (!"Mutual Fund".equals(i.getType()) || i.getName() == null) return false;
        String n = i.getName().toLowerCase(Locale.ROOT);
        return n.contains("regular") && !n.contains("direct");
    }

    /** A fixed deposit or PPF being large isn't the same risk as one share being large. */
    static boolean isDiversifiedByNature(Investment i) {
        String t = Objects.toString(i.getType(), "");
        return Set.of("Fixed Deposit", "PPF", "NPS", "Real Estate").contains(t);
    }

    static double value(Investment i) {
        Double v = i.getCurrentValue() != null ? i.getCurrentValue() : i.getInvestedAmount();
        return v == null ? 0 : Math.max(0, v);
    }

    static String rupees(double v) {
        return "₹" + String.format(Locale.ENGLISH, "%,d", Math.round(v));
    }
}
