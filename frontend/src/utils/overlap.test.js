import { describe, it, expect } from "vitest";
import { indexOf, doublingUp, sectorSplit } from "./overlap";

const h = (id, name, v = 100) => ({ holding: { id, name, currentValue: v } });

describe("doubling up", () => {
    it("reads the index from a fund's name, Next 50 before Nifty 50", () => {
        expect(indexOf("UTI Nifty Next 50 Index Fund - Direct")).toBe("Nifty Next 50");
        expect(indexOf("Nippon India Index Fund - Nifty 50 Plan")).toBe("Nifty 50");
        expect(indexOf("Nippon India ETF Nifty BeES")).toBeNull();
        expect(indexOf("Parag Parikh Flexi Cap Fund")).toBeNull();
    });

    it("finds two funds on the same index, and two in one category", () => {
        const out = doublingUp([
            { ...h(1, "UTI Nifty 50 Index Fund"), category: "Other Scheme - Index Funds" },
            { ...h(2, "HDFC Index Fund - Nifty 50 Plan"), category: "Other Scheme - Index Funds" },
            { ...h(3, "Parag Parikh Flexi Cap Fund", 300), category: "Equity Scheme - Flexi Cap Fund" },
            { ...h(4, "HDFC Flexi Cap Fund", 200), category: "Equity Scheme - Flexi Cap Fund" },
            { ...h(5, "Axis Liquid Fund"), category: "Debt Scheme - Liquid Fund" },
            { ...h(6, "SBI Liquid Fund"), category: "Debt Scheme - Liquid Fund" },
        ]);
        expect(out).toEqual([
            { kind: "same-index", label: "Nifty 50", names: ["UTI Nifty 50 Index Fund", "HDFC Index Fund - Nifty 50 Plan"], value: 200 },
            { kind: "same-category", label: "Flexi Cap", names: ["Parag Parikh Flexi Cap Fund", "HDFC Flexi Cap Fund"], value: 500 },
        ]);
    });

    it("splits stocks by sector with whole percentages adding to 100", () => {
        const rows = sectorSplit(
            [{ tickerCode: "TCS.NS", currentValue: 2 }, { tickerCode: "INFY", currentValue: 1 }, { tickerCode: "HDFCBANK.NS", currentValue: 1 }],
            { "TCS.NS": "Technology", "INFY.NS": "Technology", "HDFCBANK.NS": "Financial Services" });
        expect(rows[0]).toMatchObject({ sector: "Technology", pct: 75 });
        expect(rows.reduce((t, r) => t + r.pct, 0)).toBe(100);
    });
});
