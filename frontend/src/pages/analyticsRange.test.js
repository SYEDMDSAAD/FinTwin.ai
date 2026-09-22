import { describe, it, expect } from "vitest";
import { monthsNeeded } from "./analyticsRange";

const SEP_2026 = new Date(2026, 8, 22);        // September

describe("monthsNeeded", () => {
    it("asks for as much history as the period covers", () => {
        expect(monthsNeeded("This month", "", SEP_2026)).toBe(1);
        expect(monthsNeeded("Last month", "", SEP_2026)).toBe(2);
        expect(monthsNeeded("This year", "", SEP_2026)).toBe(9);       // Jan–Sep
        expect(monthsNeeded("Last 12 months", "", SEP_2026)).toBe(12);
        expect(monthsNeeded("All time", "", SEP_2026)).toBe(0);        // 0 = everything imported
    });

    it("counts the months a custom range reaches back", () => {
        expect(monthsNeeded("Custom", "2024-06-03", SEP_2026)).toBe(28);
        expect(monthsNeeded("Custom", "2026-09-01", SEP_2026)).toBe(1);
        expect(monthsNeeded("Custom", "not a date", SEP_2026)).toBe(3);
        expect(monthsNeeded("Custom", "", SEP_2026)).toBe(3);
    });
});
