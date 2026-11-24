import { describe, it, expect } from "vitest";
import { daysLeftInMonth, headline, attentionItems } from "./home";

const nov24 = new Date(2026, 10, 24);

describe("Home numbers", () => {
    it("counts today among the days left", () => {
        expect(daysLeftInMonth(nov24)).toBe(7);
        expect(daysLeftInMonth(new Date(2026, 10, 30))).toBe(1);
    });

    it("shows what's left of income, with a daily figure", () => {
        const h = headline({ income: 50000, spent: 36000, now: nov24 });
        expect(h.kind).toBe("income");
        expect(h.value).toBe(14000);
        expect(h.note).toMatch(/a day for the 7 days left/);
        expect(h.share).toBeCloseTo(0.72);
    });

    it("says plainly when more went out than came in", () => {
        const h = headline({ income: 10000, spent: 12500, now: nov24 });
        expect(h.value).toBe(-2500);
        expect(h.note).toMatch(/more went out than came in/);
        expect(h.share).toBe(1);
    });

    it("falls back to budgets, then to what was spent", () => {
        const b = headline({ income: 0, spent: 3000, budgets: [{ limit: 5000, spent: 3000 }], now: nov24 });
        expect(b.kind).toBe("budgets");
        expect(b.value).toBe(2000);
        const s = headline({ income: 0, spent: 3000, now: nov24 });
        expect(s.kind).toBe("spent");
        expect(s.share).toBeNull();
    });

    it("lists budget trouble first, worst alerts next, at most three", () => {
        const items = attentionItems({
            budgets: [
                { category: "Food", limit: 5000, spent: 6000 },
                { category: "Travel", limit: 2000, spent: 1700 },
                { category: "Bills", limit: 3000, spent: 100 },
            ],
            notifications: [
                { type: "info", message: "Tip" },
                { type: "danger", message: "Unusual spend" },
            ],
        });
        expect(items.map((i) => i.tone)).toEqual(["danger", "warning", "danger"]);
        expect(items[0].text).toMatch(/^Food: .*over/);
        expect(items[2].text).toBe("Unusual spend");
    });
});
