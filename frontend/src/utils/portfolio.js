/*
 * Portfolio facts shared by Home, the Portfolio page and Insights: which
 * asset class a holding is, the split across classes, what moved most,
 * and the next SIP. Facts only — never what to buy.
 */
import { rollForward, monthlyEquivalent } from "../components/SIPTracker";

export const CLASSES = ["Equity", "Debt", "Hybrid", "Gold", "Other"];

export const CLASS_COLORS = {
    Equity: "var(--accent)",
    Debt: "#0EA5A4",
    Hybrid: "#3B82F6",
    Gold: "#F59E0B",
    Other: "var(--text-dim)",
};

const FROM_STATEMENT = {
    EQUITY: "Equity", DEBT: "Debt", HYBRID: "Hybrid", GOLD: "Gold",
    LIQUID: "Debt", ELSS: "Equity", INDEX: "Equity", ARBITRAGE: "Hybrid",
};

/** The asset class of one holding: the statement's word if it gave one, else the type and name. */
export function assetClassOf(h = {}) {
    const given = FROM_STATEMENT[String(h.assetClass || "").toUpperCase()];
    if (given) return given;
    const type = h.type || "";
    const name = String(h.name || "").toLowerCase();
    if (type === "Stocks" || type === "IPO") return "Equity";
    if (type === "Gold" || /\bgold\b/.test(name)) return "Gold";
    if (["Fixed Deposit", "PPF", "Bonds"].includes(type)) return "Debt";
    if (type === "NPS") return "Hybrid";
    if (type === "Mutual Fund") {
        if (/liquid|overnight|debt|bond|gilt|money market|corporate|banking & psu|duration|credit risk/.test(name)) return "Debt";
        if (/hybrid|balanced|arbitrage|asset allocation|equity savings|multi asset/.test(name)) return "Hybrid";
        return "Equity";
    }
    return "Other";
}

/** Share of current value per asset class, largest first; percentages add up to 100. */
export function allocation(holdings = []) {
    const totals = {};
    let all = 0;
    for (const h of holdings) {
        const v = Math.max(0, Number(h.currentValue) || 0);
        if (!v) continue;
        const c = assetClassOf(h);
        totals[c] = (totals[c] || 0) + v;
        all += v;
    }
    if (!all) return [];
    const rows = Object.entries(totals)
        .map(([name, value]) => ({ name, value, pct: (value / all) * 100 }))
        .sort((a, b) => b.value - a.value);
    // Round so the shown numbers add up to exactly 100
    let used = 0;
    rows.forEach((r, i) => {
        r.pct = i === rows.length - 1 ? Math.max(0, 100 - used) : Math.round(r.pct);
        used += r.pct;
    });
    return rows;
}

/** The holding that added most and the one that held the total back most (null when none). */
export function topMovers(holdings = []) {
    const priced = holdings.filter((h) => Number.isFinite(Number(h.pnl)));
    if (priced.length === 0) return { best: null, worst: null };
    const sorted = [...priced].sort((a, b) => Number(b.pnl) - Number(a.pnl));
    const best = Number(sorted[0].pnl) > 0 ? sorted[0] : null;
    const last = sorted[sorted.length - 1];
    const worst = Number(last.pnl) < 0 ? last : null;
    return { best, worst };
}

/** Sort holdings by a column: value, returns (₹), returnsPct, xirr or name. */
export function sortHoldings(holdings = [], by = "value") {
    const key = {
        value: (h) => Number(h.currentValue) || 0,
        returns: (h) => Number(h.pnl) || 0,
        returnsPct: (h) => Number(h.pnlPercent) || 0,
        xirr: (h) => (h.xirr == null ? -Infinity : Number(h.xirr)),
    }[by];
    if (by === "name") return [...holdings].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return [...holdings].sort((a, b) => key(b) - key(a));
}

/** SIPs as a monthly total and the next one due. */
export function sipSummary(sips = [], now = new Date()) {
    const rolled = sips.map((s) => rollForward(s, now));
    const monthly = rolled.reduce((t, s) => t + monthlyEquivalent(s), 0);
    const upcoming = rolled
        .filter((s) => s.nextDebitDate)
        .sort((a, b) => String(a.nextDebitDate).localeCompare(String(b.nextDebitDate)));
    return { count: sips.length, monthly, next: upcoming[0] || null, upcoming };
}

/** Money in minus money out this month: what's spare to invest. Never below zero. */
export function spareThisMonth(income = 0, spent = 0) {
    const gap = (Number(income) || 0) - Math.abs(Number(spent) || 0);
    return { spare: Math.max(0, gap), over: gap < 0 ? -gap : 0 };
}
