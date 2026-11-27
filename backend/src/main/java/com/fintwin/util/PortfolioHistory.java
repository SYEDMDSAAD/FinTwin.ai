package com.fintwin.util;

import com.fintwin.model.HoldingTransaction;
import com.fintwin.model.Investment;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;

/**
 * Month by month, what the funds from a CAS were worth and how much had been
 * put in: units held at each month's end × that month's last NAV, against
 * the running total of money in less money out.
 */
public final class PortfolioHistory {

    private PortfolioHistory() {}

    public static final int MAX_MONTHS = 60;

    public record Point(String month, double invested, double value) {}

    /** NAVs by "YYYY-MM" for one fund. */
    public interface Navs { Map<String, Double> since(String code, YearMonth from); }

    static final Set<String> CASH_IN = Set.of("PURCHASE", "PURCHASE_SIP", "SWITCH_IN", "SWITCH_IN_MERGER",
            "STT_TAX", "STAMP_DUTY_TAX", "REDEMPTION", "SWITCH_OUT", "SWITCH_OUT_MERGER", "REVERSAL");

    public static boolean charted(Investment i, List<HoldingTransaction> ts) {
        return "Mutual Fund".equals(i.getType()) && ts != null && !ts.isEmpty()
                && i.getTickerCode() != null && i.getTickerCode().matches("\\d{3,8}");
    }

    public static List<Point> of(List<Investment> holdings, Map<Long, List<HoldingTransaction>> txns,
                                 Navs navs, LocalDate today) {
        List<Investment> funds = holdings.stream().filter(i -> charted(i, txns.get(i.getId()))).toList();
        if (funds.isEmpty()) return List.of();
        YearMonth now = YearMonth.from(today);
        YearMonth first = funds.stream().flatMap(i -> txns.get(i.getId()).stream())
                .map(t -> YearMonth.from(t.getDate())).min(YearMonth::compareTo).orElse(now);
        if (first.isBefore(now.minusMonths(MAX_MONTHS - 1))) first = now.minusMonths(MAX_MONTHS - 1);

        double[] invested = new double[(int) first.until(now, java.time.temporal.ChronoUnit.MONTHS) + 1];
        double[] value = new double[invested.length];
        for (Investment f : funds) {
            List<HoldingTransaction> ts = txns.get(f.getId());
            Map<String, Double> nav = navs.since(f.getTickerCode(), first);
            double units = 0, in = 0, lastNav = 0;
            int k = 0;
            // Everything before the chart's first month is the opening position
            for (; k < ts.size() && YearMonth.from(ts.get(k).getDate()).isBefore(first); k++) {
                units += nz(ts.get(k).getUnits());
                if (CASH_IN.contains(ts.get(k).getKind())) in += nz(ts.get(k).getAmount());
            }
            YearMonth m = first;
            for (int i = 0; i < invested.length; i++, m = m.plusMonths(1)) {
                for (; k < ts.size() && !YearMonth.from(ts.get(k).getDate()).isAfter(m); k++) {
                    units += nz(ts.get(k).getUnits());
                    if (CASH_IN.contains(ts.get(k).getKind())) in += nz(ts.get(k).getAmount());
                }
                Double n = nav.get(m.toString());
                if (n != null) lastNav = n;
                invested[i] += in;
                value[i] += Math.max(0, units) * lastNav;
            }
        }
        List<Point> out = new ArrayList<>();
        YearMonth m = first;
        for (int i = 0; i < invested.length; i++, m = m.plusMonths(1))
            out.add(new Point(m.toString(), Math.round(invested[i]), Math.round(value[i])));
        return out;
    }

    private static double nz(Double d) { return d == null ? 0 : d; }
}
