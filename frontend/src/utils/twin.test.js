import { describe, it, expect } from "vitest";
import { grow, twinExtra, series } from "./twin";

describe("twin maths", () => {
    it("compounds monthly at the assumed yearly rate", () => {
        expect(grow(100000, 0, 10, 1)).toBeCloseTo(110000, 0);
        expect(grow(0, 1000, 0, 2)).toBe(24000);
        // ₹5,000 a month for 10 years at 12% a year: about ₹11.2 lakh
        expect(grow(0, 5000, 12, 10)).toBeGreaterThan(1_100_000);
        expect(grow(0, 5000, 12, 10)).toBeLessThan(1_130_000);
    });

    it("counts only the habits the user switched on", () => {
        const inputs = { roundUps: { amount: 412 }, pausedThisMonth: 2500 };
        expect(twinExtra(inputs)).toBe(2912);
        expect(twinExtra(inputs, { roundUps: false, pauses: true, extra: 1000 })).toBe(3500);
        expect(twinExtra(null)).toBe(0);
    });

    it("starts both lines at today's portfolio and the twin pulls ahead", () => {
        const s = series({ portfolioValue: 200000, sipMonthly: 5000, pausedThisMonth: 3000 }, {}, 10, 10);
        expect(s).toHaveLength(11);
        expect(s[0]).toEqual({ year: 0, you: 200000, twin: 200000 });
        expect(s[10].twin).toBeGreaterThan(s[10].you);
    });
});
