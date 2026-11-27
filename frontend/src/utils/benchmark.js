/*
 * Each fund against a plain index fund for its kind, like INDmoney's
 * "vs benchmark": the cheapest way to own that market is the yardstick.
 * A fact about past returns, never a call to switch.
 */

export const BENCHMARKS = {
    nifty50: { code: "120716", name: "Nifty 50 index fund" },
    midcap: { code: "147622", name: "Nifty Midcap 150 index fund" },
    smallcap: { code: "147623", name: "Nifty Smallcap 250 index fund" },
};

/** Which index fund a fund is measured against, from its AMFI category; null when none fits. */
export function benchmarkFor(category = "") {
    const c = category.toLowerCase();
    if (!c.includes("equity") || c.includes("index")) return null;          // index funds are the index
    if (/small cap/.test(c)) return BENCHMARKS.smallcap;
    if (/mid cap/.test(c) && !/large & mid|large and mid/.test(c)) return BENCHMARKS.midcap;
    if (/large cap|flexi|multi|focused|elss|value|contra|large & mid|dividend yield/.test(c)) return BENCHMARKS.nifty50;
    return null;                                                            // sector and thematic funds: no fair yardstick
}

export const LAG_POINTS = 2;   // trailing by 2+ percentage points a year is worth a mention

/**
 * Compare over the longest period both have (5y, then 3y, then 1y).
 * gap = fund − index, in percentage points a year.
 */
export function compare(fundReturns = {}, indexReturns = {}) {
    for (const k of ["5y", "3y", "1y"]) {
        const f = fundReturns[k], i = indexReturns[k];
        if (f != null && i != null) {
            const gap = Math.round((f - i) * 10) / 10;
            return { period: k, fund: f, index: i, gap, lagging: gap <= -LAG_POINTS };
        }
    }
    return null;
}
