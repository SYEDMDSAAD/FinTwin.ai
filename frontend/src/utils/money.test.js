import { describe, it, expect } from "vitest";
import { rupees, lakhs, percent, dayRange, longDate, changeTone, GOOD, BAD, NEUTRAL, MINUS } from "./money";

describe("money formatting", () => {
    it("puts a real minus sign in front of the rupee sign", () => {
        expect(rupees(-2246)).toBe(`${MINUS}₹2,246`);
        expect(rupees(-2246)).not.toContain("₹-");
        expect(rupees(6522, { plus: true })).toBe("+₹6,522");
        expect(rupees(6522)).toBe("₹6,522");
        expect(rupees(0, { plus: true })).toBe("₹0");
        expect(rupees(-0.4)).toBe("₹0");
        expect(rupees(164286)).toBe("₹1,64,286");
    });

    it("writes lakhs and percentages the same way", () => {
        expect(lakhs(-9164)).toBe(`${MINUS}₹0.09L`);
        expect(lakhs(79830)).toBe("₹0.80L");
        expect(percent(-11.48)).toBe(`${MINUS}11.5%`);
        expect(percent(3.97)).toBe("4%");
        expect(percent(310.7, { plus: true })).toBe("+310.7%");
        expect(percent(null)).toBe("0%");
    });

    it("names a period by its days", () => {
        expect(dayRange("2026-10-01", "2026-10-20")).toBe("1–20 Oct");
        expect(dayRange("2026-10-01", "2026-10-01")).toBe("1 Oct");
        expect(dayRange("2026-09-28", "2026-10-03")).toBe("28 Sep – 3 Oct");
        expect(dayRange(undefined, "2026-10-03")).toBe("");
        expect(longDate("2026-06-24")).toBe("24 Jun 2026");
    });

    it("colours a change by whether it is good, not by its direction", () => {
        expect(changeTone(12, true)).toBe(GOOD);     // more income
        expect(changeTone(-12, true)).toBe(BAD);     // less income
        expect(changeTone(12, false)).toBe(BAD);     // more spending
        expect(changeTone(-12, false)).toBe(GOOD);   // less spending
        expect(changeTone(0, false)).toBe(NEUTRAL);
    });
});
