import { describe, it, expect } from "vitest";
import { benchmarkFor, compare, BENCHMARKS } from "./benchmark";

describe("fund against its index", () => {
    it("measures each kind of equity fund against the index fund for that market", () => {
        expect(benchmarkFor("Equity Scheme - Flexi Cap Fund")).toBe(BENCHMARKS.nifty50);
        expect(benchmarkFor("Equity Scheme - Mid Cap Fund")).toBe(BENCHMARKS.midcap);
        expect(benchmarkFor("Equity Scheme - Large & Mid Cap Fund")).toBe(BENCHMARKS.nifty50);
        expect(benchmarkFor("Equity Scheme - Small Cap Fund")).toBe(BENCHMARKS.smallcap);
        expect(benchmarkFor("Other Scheme - Index Funds")).toBeNull();
        expect(benchmarkFor("Debt Scheme - Liquid Fund")).toBeNull();
        expect(benchmarkFor("Equity Scheme - Sectoral/ Thematic")).toBeNull();
    });

    it("uses the longest period both have, and flags a 2-point lag", () => {
        expect(compare({ "1y": 10, "3y": 12 }, { "1y": 8, "3y": 15, "5y": 14 })).toEqual({ period: "3y", fund: 12, index: 15, gap: -3, lagging: true });
        expect(compare({ "1y": 10 }, { "1y": 9 }).lagging).toBe(false);
        expect(compare({}, { "1y": 9 })).toBeNull();
    });
});
