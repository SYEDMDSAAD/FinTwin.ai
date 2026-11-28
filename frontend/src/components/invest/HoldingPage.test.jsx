import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { pageKind } from "../../utils/investMath";

const get = vi.hoisted(() => vi.fn());
vi.mock("../../services/api", () => ({ default: { get, post: vi.fn() } }));
vi.mock("recharts", () => {
    const Box = ({ children }) => <div>{children}</div>;
    return { ResponsiveContainer: Box, AreaChart: Box, Area: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null };
});

import HoldingPage from "./HoldingPage";

describe("a holding's own page", () => {
    it("picks the page by kind, like the big apps", () => {
        expect(pageKind({ type: "Mutual Fund", tickerCode: "122639" })).toBe("fund");
        expect(pageKind({ type: "Mutual Fund" })).toBe("basic");
        expect(pageKind({ type: "Stocks", tickerCode: "TCS.NS" })).toBe("stock");
        expect(pageKind({ type: "IPO", ipoStatus: "APPLIED" })).toBe("ipo");
        expect(pageKind({ type: "IPO", ipoStatus: "LISTED", tickerCode: "ABC" })).toBe("stock");
        expect(pageKind({ type: "Fixed Deposit" })).toBe("deposit");
        expect(pageKind({ type: "Gold" })).toBe("basic");
    });

    it("shows a fund's NAV, past returns, plan and the user's units", async () => {
        get.mockImplementation((url) => {
            if (url === "/discover/funds/122639") return Promise.resolve({ data: { name: "Parag Parikh Flexi Cap Fund - Direct Plan - Growth", amc: "PPFAS Mutual Fund", category: "Equity Scheme - Flexi Cap Fund", nav: 96.5, nav_date: "27-Nov-2026", returns: { "1y": 14.2, "3y": 19.1 } } });
            if (url.endsWith("/history")) return Promise.resolve({ data: { change: 14.2, since: "2013-05-24", points: [{ date: "2025-11-27", nav: 84 }, { date: "2026-11-27", nav: 96.5 }] } });
            return Promise.resolve({ data: [] });
        });
        render(<HoldingPage holding={{ id: 1, type: "Mutual Fund", name: "Parag Parikh Flexi Cap Fund", tickerCode: "122639", investedAmount: 60000, currentValue: 71800, units: 744 }} onBack={() => {}} />);
        expect(await screen.findByText("₹96.50")).toBeInTheDocument();
        expect(screen.getByText("+19.1%")).toBeInTheDocument();
        expect(screen.getByText("Direct")).toBeInTheDocument();
        expect(screen.getByText("Flexi Cap Fund")).toBeInTheDocument();
        expect(screen.getByText("744")).toBeInTheDocument();
        await waitFor(() => expect(screen.getByText("13 yrs")).toBeInTheDocument());
    });

    it("shows an FD's interest so far and what it grows to", () => {
        render(<HoldingPage holding={{ id: 2, type: "Fixed Deposit", name: "SBI FD", investedAmount: 100000, currentValue: 100000, interestRate: 7, purchaseDate: "2025-01-01" }} onBack={() => {}} />);
        expect(screen.getByText("Interest earned")).toBeInTheDocument();
        expect(screen.getByText("In 5 yrs")).toBeInTheDocument();
    });

    it("shows an IPO application's timeline and minimum", async () => {
        get.mockResolvedValue({ data: [{ id: 9, name: "Acme", openDate: "2020-01-01", closeDate: "2020-01-03", priceBandLow: 100, priceBandHigh: 120, lotSize: 125 }] });
        render(<HoldingPage holding={{ id: 3, type: "IPO", name: "Acme", ipoStatus: "APPLIED", ipoListingId: 9, investedAmount: 15000 }} onBack={() => {}} />);
        expect(await screen.findByText("₹15,000", { selector: "dd" })).toBeInTheDocument();
        expect(screen.getByText("Timeline")).toBeInTheDocument();
        expect(screen.getByText("Applied")).toBeInTheDocument();
    });
});
