import { describe, it, expect } from "vitest";
import { navOnOrAfter, xirr, lumpSum, sipReturns, fdValue, ipoSteps, ipoMinimum, rangePosition } from "./investMath";

// A fund growing 1% a month, one NAV per day for six years
function series(years = 6) {
    const out = [];
    const d = new Date("2020-01-01T00:00:00");
    for (let i = 0; i < years * 365; i++) {
        out.push({ date: d.toISOString().slice(0, 10), nav: 10 * Math.pow(1.01, i / 30.4) });
        d.setDate(d.getDate() + 1);
    }
    return out;
}

describe("holding maths", () => {
    it("finds the next NAV on a holiday", () => {
        const navs = [{ date: "2024-01-01", nav: 1 }, { date: "2024-01-03", nav: 2 }];
        expect(navOnOrAfter(navs, "2024-01-02").nav).toBe(2);
        expect(navOnOrAfter(navs, "2024-02-01")).toBeNull();
    });

    it("works out XIRR: ₹100 to ₹110 in a year is 10%", () => {
        expect(xirr([{ date: "2023-01-01", amount: -100 }, { date: "2024-01-01", amount: 110 }])).toBeCloseTo(10, 0);
    });

    it("values a lump sum on past NAVs, and says nothing for a fund too young", () => {
        const navs = series();
        const r = lumpSum(navs, 10000, 3);
        expect(r.perYear).toBeGreaterThan(12);
        expect(r.perYear).toBeLessThan(13.5);           // ~12.7% a year
        expect(lumpSum(navs, 10000, 10)).toBeNull();
    });

    it("runs a monthly SIP with one instalment a month", () => {
        const r = sipReturns(series(), 5000, 3);
        expect(r.instalments).toBe(36);
        expect(r.invested).toBe(180000);
        expect(r.value).toBeGreaterThan(r.invested);
        expect(r.perYear).toBeGreaterThan(11);
    });

    it("compounds an FD quarterly", () => {
        const fd = fdValue(100000, 7, "2025-01-01", new Date("2026-01-01T00:00:00"));
        expect(fd.today).toBe(107186);                  // 1 lakh at 7% for a year, quarterly
        expect(fd.ahead.map((a) => a.years)).toEqual([1, 3, 5]);
        expect(fdValue(0, 7, "2024-01-01")).toBeNull();
    });

    it("lays out an IPO's steps and its minimum", () => {
        const ipo = { openDate: "2026-11-20", closeDate: "2026-11-24", allotmentDate: "2026-11-25", listingDate: "2026-11-28", priceBandHigh: 120, lotSize: 125 };
        const steps = ipoSteps(ipo, new Date("2026-11-26T00:00:00"));
        expect(steps.filter((s) => s.done).map((s) => s.label)).toEqual(["Opens", "Closes", "Allotment"]);
        expect(ipoMinimum(ipo)).toBe(15000);
    });

    it("places a price in its 52-week range", () => {
        expect(rangePosition(150, 100, 200)).toBe(50);
        expect(rangePosition(150, null, 200)).toBeNull();
    });
});

import { grown, pauseToInvest } from "./investMath";

describe("Pause → Invest", () => {
    it("grows a skipped amount at three plain rates", () => {
        expect(grown(2400, 10, 5)).toBe(3865);
        const p = pauseToInvest(2400, 5, 13.84);
        expect(p.at.map((a) => a.rate)).toEqual([8, 10, 12]);
        expect(p.own.rate).toBe(13.8);
    });

    it("ignores an own return that isn't a sensible yearly number", () => {
        expect(pauseToInvest(2400, 5, 120).own).toBeNull();
        expect(pauseToInvest(2400, 5, -4).own).toBeNull();
        expect(pauseToInvest(0)).toBeNull();
    });
});
