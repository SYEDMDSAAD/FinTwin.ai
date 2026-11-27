import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const get = vi.hoisted(() => vi.fn());
vi.mock("../../services/api", () => ({ default: { get } }));

import BenchmarkCard from "./BenchmarkCard";
import { OverlapCard, SectorCard } from "./OverlapCard";
import InvestPot from "../home/InvestPot";

const fund = (id, name, category, returns) => ({ holding: { id, name, currentValue: 1000 }, fund: { category, returns } });

describe("Insights cards", () => {
    it("puts a fund next to its index and calls out a laggard plainly", async () => {
        get.mockResolvedValue({ data: { returns: { "1y": 10, "3y": 15 } } });     // the Nifty 50 index fund
        render(<BenchmarkCard details={[fund(1, "Slow Flexi Cap", "Equity Scheme - Flexi Cap Fund", { "1y": 9, "3y": 11 })]} />);
        expect(await screen.findByText(/trailed the Nifty 50 index fund by 4 points a year over 3 years/)).toBeInTheDocument();
        expect(screen.getByText("behind by 4 pts")).toBeInTheDocument();
        expect(document.body.textContent).not.toMatch(/switch|should sell|recommend that/i);
    });

    it("names funds that track the same index", () => {
        render(<OverlapCard details={[fund(1, "UTI Nifty 50 Index Fund", "Other Scheme - Index Funds"), fund(2, "HDFC Index Fund - Nifty 50 Plan", "Other Scheme - Index Funds")]} />);
        expect(screen.getByText("2 funds track the Nifty 50")).toBeInTheDocument();
    });

    it("splits directly held shares by sector", async () => {
        get.mockResolvedValue({ data: { "TCS.NS": "Technology", "HDFCBANK.NS": "Financial Services" } });
        render(<SectorCard holdings={[{ id: 1, type: "Stocks", tickerCode: "TCS.NS", currentValue: 300 }, { id: 2, type: "Stocks", tickerCode: "HDFCBANK.NS", currentValue: 100 }]} />);
        expect(await screen.findByText("75% of your shares are in one sector: Technology.")).toBeInTheDocument();
    });

    it("shows the invest pot: round-ups plus money kept by pausing", async () => {
        get.mockResolvedValue({ data: { roundUps: { amount: 312, payments: 41 }, pausedThisMonth: 2400, wishlistReady: [{ name: "Sneakers", amount: 3999 }] } });
        render(<InvestPot />);
        const pot = await screen.findByRole("button", { name: "Invest pot" });
        expect(pot).toHaveTextContent("₹2,712");
        expect(pot).toHaveTextContent("₹312 in round-ups on 41 payments · ₹2,400 kept by pausing");
        expect(pot).toHaveTextContent("Sneakers (₹3,999) is past the 2-day wait");
    });
});
