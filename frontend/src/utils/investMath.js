/*
 * Maths for the holding pages: past-returns calculators on real NAVs, FD
 * interest the way banks compound it, and where an IPO is in its timeline.
 * Facts and arithmetic only: nothing here says what to buy.
 */

const DAY = 86_400_000;
const toDate = (iso) => new Date(`${iso}T00:00:00`);
// Local calendar date: toISOString() would shift IST midnight to the day before
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** First NAV on or after the date (units are allotted at the next NAV). */
export function navOnOrAfter(navs, day) {
    const t = typeof day === "string" ? day : iso(day);
    let lo = 0, hi = navs.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (navs[mid].date < t) lo = mid + 1; else hi = mid; }
    return navs[lo] || null;
}

/** XIRR (% a year) of dated cash flows: money in is negative, the value today positive. */
export function xirr(flows) {
    if (flows.length < 2) return null;
    const t0 = toDate(flows[0].date).getTime();
    const years = flows.map((f) => (toDate(f.date).getTime() - t0) / (365 * DAY));
    const npv = (r) => flows.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, years[i]), 0);
    let lo = -0.99, hi = 10;
    if (npv(lo) * npv(hi) > 0) return null;
    for (let i = 0; i < 100; i++) {
        const mid = (lo + hi) / 2;
        if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
    }
    return Math.round(((lo + hi) / 2) * 1000) / 10;
}

function startFor(navs, years) {
    const last = navs[navs.length - 1];
    const start = toDate(last.date);
    start.setFullYear(start.getFullYear() - years);
    const first = navOnOrAfter(navs, start);
    // The fund must have existed then (a NAV within ten days of the start)
    if (!first || toDate(first.date) - start > 10 * DAY) return null;
    return { start, first, last };
}

/** One amount invested `years` ago, valued today. null when the fund is younger. */
export function lumpSum(navs, amount, years) {
    if (!navs?.length || !(amount > 0)) return null;
    const s = startFor(navs, years);
    if (!s) return null;
    const value = (amount / s.first.nav) * s.last.nav;
    return {
        invested: amount, value: Math.round(value), gain: Math.round(value - amount),
        perYear: Math.round((Math.pow(value / amount, 1 / years) - 1) * 1000) / 10,
    };
}

/** A monthly SIP started `years` ago, valued today, with its XIRR. */
export function sipReturns(navs, monthly, years) {
    if (!navs?.length || !(monthly > 0)) return null;
    const s = startFor(navs, years);
    if (!s) return null;
    let units = 0;
    const flows = [];
    for (let m = 0; m < years * 12; m++) {
        const d = new Date(s.start);
        d.setMonth(d.getMonth() + m);
        const p = navOnOrAfter(navs, d);
        if (!p || p.date > s.last.date) break;
        units += monthly / p.nav;
        flows.push({ date: p.date, amount: -monthly });
    }
    const value = units * s.last.nav;
    const invested = flows.length * monthly;
    return {
        invested, value: Math.round(value), gain: Math.round(value - invested), instalments: flows.length,
        perYear: xirr([...flows, { date: s.last.date, amount: value }]),
    };
}

/**
 * A fixed deposit, compounded quarterly as Indian banks do:
 * value = principal × (1 + rate/400)^(quarters). Interest so far is to today.
 * PPF compounds once a year: pass perYear = 1.
 */
export function fdValue(principal, ratePct, startIso, today = new Date(), perYear = 4) {
    if (!(principal > 0) || !(ratePct > 0) || !startIso) return null;
    const start = toDate(startIso);
    const years = Math.max(0, (today - start) / (365 * DAY));
    const at = (y) => Math.round(principal * Math.pow(1 + ratePct / (100 * perYear), perYear * y));
    const now = at(years);
    return {
        today: now, interest: now - principal, heldYears: Math.round(years * 10) / 10,
        ahead: [1, 3, 5].map((y) => ({ years: y, value: at(years + y) })),
    };
}

/** Where an IPO is: each step with its date and whether it has happened. */
export function ipoSteps(ipo, today = new Date()) {
    if (!ipo) return [];
    const now = iso(today);
    return [
        ["Opens", ipo.openDate], ["Closes", ipo.closeDate],
        ["Allotment", ipo.allotmentDate], ["Listing", ipo.listingDate],
    ].map(([label, date]) => ({ label, date: date || null, done: !!date && date <= now }));
}

/** Minimum to apply: one lot at the top of the price band. */
export function ipoMinimum(ipo) {
    const price = ipo?.issuePrice ?? ipo?.priceBandHigh;
    return price && ipo?.lotSize ? Math.round(price * ipo.lotSize) : null;
}

/** Where today's price sits between the 52-week low and high, 0–100. */
export function rangePosition(price, low, high) {
    if (price == null || low == null || high == null || high <= low) return null;
    return Math.max(0, Math.min(100, Math.round(((price - low) / (high - low)) * 100)));
}

/** A fund's plan and option, read from its AMFI name. */
export function planOf(name = "") {
    const n = name.toLowerCase();
    return {
        plan: n.includes("direct") ? "Direct" : n.includes("regular") ? "Regular" : "—",
        option: /idcw|dividend/.test(n) ? "IDCW (payouts)" : n.includes("growth") ? "Growth" : "—",
    };
}

const DEPOSITS = new Set(["Fixed Deposit", "FD", "PPF", "Bonds", "RD", "EPF"]);

/** Which page a holding opens: fund, stock, deposit, ipo, or basic facts. */
export function pageKind(h) {
    const code = (h.tickerCode || "").trim();
    if (h.type === "IPO") return h.ipoStatus === "LISTED" && code ? "stock" : "ipo";
    if (h.type === "Mutual Fund") return /^\d{1,10}$/.test(code) ? "fund" : "basic";
    if (h.type === "Stocks") return code ? "stock" : "basic";
    if (DEPOSITS.has(h.type)) return "deposit";
    return "basic";
}

export const inr2 = (n) => n == null ? "—" : "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Price for a tooltip (two places) or, on an axis, short: ₹96, ₹1.2k, ₹14k. */
export const shortInr = (v, axis) => axis
    ? (v >= 1000 ? `₹${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `₹${Math.round(v)}`)
    : inr2(v);

/** A lump sum left to grow, compounded yearly: amount × (1 + r)^years. */
export function grown(amount, ratePct, years) {
    if (!(amount > 0)) return 0;
    return Math.round(amount * Math.pow(1 + ratePct / 100, years));
}

/*
 * Pause → Invest: what money not spent could grow to. Three plain rates, so
 * no single number reads like a promise, plus the user's own portfolio
 * XIRR when it's a sensible number from at least a year of investing.
 */
export const PAUSE_RATES = [8, 10, 12];

export function pauseToInvest(amount, years = 5, ownXirr = null) {
    if (!(amount > 0)) return null;
    const own = ownXirr != null && ownXirr > 0 && ownXirr < 40 ? Math.round(ownXirr * 10) / 10 : null;
    return {
        amount, years,
        at: PAUSE_RATES.map((r) => ({ rate: r, value: grown(amount, r, years) })),
        own: own != null ? { rate: own, value: grown(amount, own, years) } : null,
    };
}
