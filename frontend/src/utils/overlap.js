/*
 * Doubling up, from what we can know for certain without each fund's
 * monthly holdings list: funds that track the same index hold the same
 * stocks, and several funds in one SEBI category often own many of the
 * same companies. Facts about what the user holds; never "sell one".
 */

const INDICES = [
    [/nifty\s*next\s*50|next\s*50/i, "Nifty Next 50"],
    [/midcap\s*150/i, "Nifty Midcap 150"],
    [/smallcap\s*250/i, "Nifty Smallcap 250"],
    [/nifty\s*500/i, "Nifty 500"],
    [/sensex/i, "Sensex"],
    [/nifty\s*100\b/i, "Nifty 100"],
    [/nifty\s*50\b|nifty\s*fifty/i, "Nifty 50"],
];

/** The index a fund tracks, from its name ("Nifty Next 50" before "Nifty 50"), or null. */
export function indexOf(name = "") {
    if (!/index|etf|bees/i.test(name)) return null;
    for (const [re, label] of INDICES) if (re.test(name)) return label;
    return null;
}

const shortCategory = (c = "") => c.replace(/^.*Scheme - /, "").replace(/ Fund$/, "").trim();

/**
 * items: [{ holding: { id, name, currentValue }, category }]
 * → [{ kind: "same-index" | "same-category", label, names[], value }]
 */
export function doublingUp(items) {
    const out = [];
    const byIndex = new Map();
    for (const it of items) {
        const idx = indexOf(it.holding.name);
        if (idx) byIndex.set(idx, [...(byIndex.get(idx) || []), it]);
    }
    for (const [label, group] of byIndex) {
        if (group.length > 1) out.push({ kind: "same-index", label, names: group.map((g) => g.holding.name), value: sum(group) });
    }
    const byCat = new Map();
    for (const it of items) {
        const c = shortCategory(it.category);
        if (!c || /index|etf|liquid|overnight|money market/i.test(c) || indexOf(it.holding.name)) continue;
        byCat.set(c, [...(byCat.get(c) || []), it]);
    }
    for (const [label, group] of byCat) {
        if (group.length > 1) out.push({ kind: "same-category", label, names: group.map((g) => g.holding.name), value: sum(group) });
    }
    return out;
}

function sum(group) {
    return group.reduce((t, g) => t + (Number(g.holding.currentValue) || 0), 0);
}

/** Stocks by sector: [{ sector, value, pct }] largest first, percentages adding to 100. */
export function sectorSplit(stocks, sectors) {
    const by = new Map();
    for (const s of stocks) {
        const key = sectors[(s.tickerCode || "").trim().toUpperCase()] || sectors[`${(s.tickerCode || "").trim().toUpperCase()}.NS`] || "Unknown";
        by.set(key, (by.get(key) || 0) + (Number(s.currentValue) || 0));
    }
    const total = [...by.values()].reduce((a, b) => a + b, 0);
    if (total <= 0) return [];
    const rows = [...by.entries()].map(([sector, value]) => ({ sector, value, pct: Math.round((value / total) * 100) }))
        .sort((a, b) => b.value - a.value);
    const drift = 100 - rows.reduce((t, r) => t + r.pct, 0);
    rows[0].pct += drift;
    return rows;
}
