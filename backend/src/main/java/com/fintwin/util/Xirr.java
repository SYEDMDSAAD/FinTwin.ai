package com.fintwin.util;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

/**
 * Annualised return on dated cash flows (the XIRR spreadsheets compute):
 * the rate r at which Σ amount / (1 + r)^(days / 365) = 0.
 *
 * Flows are from the investor's side: money put in is negative, money taken
 * out (redemptions, dividends paid out, today's value) is positive. Like
 * AMFI's rule for fund returns, anything held for under a year gets no
 * annualised figure: a 3% gain in two months isn't "20% a year".
 */
public final class Xirr {

    private Xirr() {}

    public record Flow(LocalDate date, double amount) {}

    public static final int MIN_DAYS = 365;

    /** The annual rate as a fraction (0.12 = 12%), or null when it can't or shouldn't be stated. */
    public static Double of(List<Flow> flows) {
        List<Flow> fs = new ArrayList<>();
        for (Flow f : flows) if (f.date() != null && Math.abs(f.amount()) >= 0.005) fs.add(f);
        if (fs.size() < 2) return null;
        LocalDate start = fs.stream().map(Flow::date).min(LocalDate::compareTo).orElseThrow();
        LocalDate end = fs.stream().map(Flow::date).max(LocalDate::compareTo).orElseThrow();
        if (ChronoUnit.DAYS.between(start, end) < MIN_DAYS) return null;
        boolean in = fs.stream().anyMatch(f -> f.amount() > 0), out = fs.stream().anyMatch(f -> f.amount() < 0);
        if (!in || !out) return null;

        double[] t = new double[fs.size()], a = new double[fs.size()];
        for (int i = 0; i < fs.size(); i++) {
            t[i] = ChronoUnit.DAYS.between(start, fs.get(i).date()) / 365.0;
            a[i] = fs.get(i).amount();
        }
        // NPV falls as the rate rises (outflows come first), so bisection on a
        // wide bracket always finds the root when there is one.
        double lo = -0.9999, hi = 100;
        double fLo = npv(lo, t, a), fHi = npv(hi, t, a);
        if (Double.isNaN(fLo) || Double.isNaN(fHi) || fLo * fHi > 0) return null;
        for (int i = 0; i < 200; i++) {
            double mid = (lo + hi) / 2, fMid = npv(mid, t, a);
            if (Math.abs(fMid) < 1e-7 || hi - lo < 1e-10) return mid;
            if (fLo * fMid < 0) { hi = mid; } else { lo = mid; fLo = fMid; }
        }
        return (lo + hi) / 2;
    }

    private static double npv(double r, double[] t, double[] a) {
        double s = 0;
        for (int i = 0; i < t.length; i++) s += a[i] / Math.pow(1 + r, t[i]);
        return s;
    }
}
