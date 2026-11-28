import { describe, it, expect } from "vitest";
import { assetClassOf, allocation, topMovers, sortHoldings, sipSummary, spareThisMonth } from "./portfolio";

describe("portfolio facts", () => {
    it("puts each holding in an asset class, trusting the statement first", () => {
        expect(assetClassOf({ type: "Stocks" })).toBe("Equity");
        expect(assetClassOf({ type: "PPF" })).toBe("Debt");
        expect(assetClassOf({ type: "Mutual Fund", name: "HDFC Liquid Fund - Direct" })).toBe("Debt");
        expect(assetClassOf({ type: "Mutual Fund", name: "ICICI Balanced Advantage Fund" })).toBe("Hybrid");
        expect(assetClassOf({ type: "Mutual Fund", name: "Nippon India Gold Savings Fund" })).toBe("Gold");
        expect(assetClassOf({ type: "Mutual Fund", name: "Parag Parikh Flexi Cap" })).toBe("Equity");
        expect(assetClassOf({ type: "Mutual Fund", name: "Odd name", assetClass: "DEBT" })).toBe("Debt");
    });

    it("splits value by class into whole percentages that add up to 100", () => {
        const rows = allocation([
            { type: "Stocks", currentValue: 1 }, { type: "PPF", currentValue: 1 }, { type: "Gold", currentValue: 1 },
        ]);
        expect(rows.reduce((t, r) => t + r.pct, 0)).toBe(100);
        expect(allocation([])).toEqual([]);
    });

    it("finds what added most and what held the total back", () => {
        const { best, worst } = topMovers([{ name: "A", pnl: 500 }, { name: "B", pnl: -200 }, { name: "C", pnl: 50 }]);
        expect(best.name).toBe("A");
        expect(worst.name).toBe("B");
        expect(topMovers([{ name: "A", pnl: 10 }]).worst).toBeNull();
    });

    it("sorts holdings by value, returns, XIRR (none last) and name", () => {
        const h = [{ name: "b", currentValue: 1, pnl: 9, xirr: null }, { name: "a", currentValue: 5, pnl: 1, xirr: 12 }];
        expect(sortHoldings(h, "value")[0].name).toBe("a");
        expect(sortHoldings(h, "returns")[0].name).toBe("b");
        expect(sortHoldings(h, "xirr")[0].name).toBe("a");
        expect(sortHoldings(h, "name")[0].name).toBe("a");
    });

    it("adds SIPs up to a month and finds the next debit", () => {
        const s = sipSummary([
            { fundName: "Q", amount: 3000, frequency: "Quarterly", nextDebitDate: "2099-03-01" },
            { fundName: "M", amount: 2000, frequency: "Monthly", nextDebitDate: "2099-01-10" },
        ], new Date(2098, 11, 1));
        expect(s.monthly).toBe(3000);
        expect(s.next.fundName).toBe("M");
    });

    it("counts spare money as money in minus money out, never below zero", () => {
        expect(spareThisMonth(72000, 53760)).toEqual({ spare: 18240, over: 0 });
        expect(spareThisMonth(72000, -77714)).toEqual({ spare: 0, over: 5714 });
    });
});
