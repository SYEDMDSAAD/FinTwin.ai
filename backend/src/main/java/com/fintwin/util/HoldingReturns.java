package com.fintwin.util;

import com.fintwin.model.HoldingTransaction;
import com.fintwin.model.Investment;
import com.fintwin.util.Xirr.Flow;

import java.time.LocalDate;
import java.util.*;

/**
 * XIRR per holding and for the whole portfolio. A holding imported from a
 * CAS uses its real purchases, SIP instalments, redemptions and dividends;
 * one added by hand is estimated from its amount and purchase date as a
 * single lump sum, and says so.
 */
public final class HoldingReturns {

    private HoldingReturns() {}

    public record Of(Double xirr, boolean estimated) {}

    public record Result(Map<Long, Of> holdings, Double portfolio) {}

    /** Lines that move no money: units arriving or leaving without cash, or bookkeeping. */
    static final Set<String> NO_CASH = Set.of("DIVIDEND_REINVEST", "GIFT_IN", "GIFT_OUT", "SEGREGATION", "MISC", "UNKNOWN");

    public static Result of(List<Investment> holdings, Map<Long, List<HoldingTransaction>> txns, LocalDate today) {
        Map<Long, Of> each = new HashMap<>();
        List<Flow> all = new ArrayList<>();
        for (Investment i : holdings) {
            List<HoldingTransaction> ts = txns.getOrDefault(i.getId(), List.of());
            boolean estimated = ts.isEmpty();
            List<Flow> flows = estimated ? estimate(i, today) : actual(i, ts, today);
            if (flows.isEmpty()) continue;
            each.put(i.getId(), new Of(Xirr.of(flows), estimated));
            all.addAll(flows);
        }
        return new Result(each, Xirr.of(all));
    }

    static List<Flow> actual(Investment i, List<HoldingTransaction> ts, LocalDate today) {
        List<Flow> flows = new ArrayList<>();
        for (HoldingTransaction t : ts) {
            if (t.getAmount() == null || NO_CASH.contains(t.getKind())) continue;
            // Statement amounts are from the fund's side (+ in, − out); the investor's are the reverse.
            // A dividend paid out is money to the investor whatever its printed sign.
            double flow = "DIVIDEND_PAYOUT".equals(t.getKind()) ? Math.abs(t.getAmount()) : -t.getAmount();
            flows.add(new Flow(t.getDate(), flow));
        }
        double value = i.getCurrentValue() == null ? 0 : i.getCurrentValue();
        if (value > 0) flows.add(new Flow(today, value));
        return flows;
    }

    static List<Flow> estimate(Investment i, LocalDate today) {
        Double put = i.getInvestedAmount(), now = i.getCurrentValue();
        if (i.getPurchaseDate() == null || put == null || put <= 0 || now == null) return List.of();
        return List.of(new Flow(i.getPurchaseDate(), -put), new Flow(today, now));
    }
}
