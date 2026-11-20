import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

import AnalyticsCards from "./AnalyticsCards";
import { GOOD, BAD, NEUTRAL, MINUS } from "../utils/money";

const COMPARED = { from: "2026-10-01", to: "2026-10-20", income: 24585, expenses: 36780, savings: -12195 };

function show(props) {
    vi.useFakeTimers();
    render(<AnalyticsCards prediction={15000} compared={COMPARED} {...props} />);
    act(() => { vi.advanceTimersByTime(3000); });
}

// jsdom reports colours as rgb()
const rgb = (hex) => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

afterEach(() => { vi.useRealTimers(); });

describe("AnalyticsCards", () => {
    it("says each figure is this month and what it is compared with", () => {
        show({ income: 12641, expenses: 14887, savings: -2246, incomeTrend: -48.6, expenseTrend: -59.5, savingsTrend: 81.6 });

        expect(screen.getAllByText("This month · vs 1–20 Oct")).toHaveLength(3);
        expect(screen.getByText("Next month")).toBeInTheDocument();
    });

    it("writes a loss as −₹2,246", () => {
        show({ income: 12641, expenses: 14887, savings: -2246, incomeTrend: 0, expenseTrend: 0, savingsTrend: 0 });

        expect(screen.getByText(`${MINUS}₹2,246`)).toBeInTheDocument();
        expect(screen.queryByText(/₹-/)).toBeNull();
        expect(screen.getByText("₹14,887")).toBeInTheDocument();
    });

    it("colours the change green when it is good and red when it is bad", () => {
        show({ income: 12641, expenses: 14887, savings: -2246, incomeTrend: -48.6, expenseTrend: -59.5, savingsTrend: 81.6 });

        const income = screen.getByTestId("trend-Total Income");
        const spent = screen.getByTestId("trend-Total Expenses");
        const saved = screen.getByTestId("trend-Net Savings");

        expect(income).toHaveTextContent(`${MINUS}48.6%`);
        expect(income.style.color).toBe(rgb(BAD));        // less came in
        expect(spent).toHaveTextContent(`${MINUS}59.5%`);
        expect(spent.style.color).toBe(rgb(GOOD));        // less went out
        expect(saved).toHaveTextContent("+81.6%");
        expect(saved.style.color).toBe(rgb(GOOD));
        expect(income).toHaveAttribute("title", "₹24,585 on 1–20 Oct");
    });

    it("shows no change, not 0%, when there is nothing to compare with", () => {
        show({ income: 500, expenses: 0, savings: 500, incomeTrend: 0, expenseTrend: 0, savingsTrend: 0,
               compared: { ...COMPARED, income: 0 } });

        const income = screen.getByTestId("trend-Total Income");
        expect(income).toHaveTextContent("—");
        expect(income.style.color).toBe(rgb(NEUTRAL));
    });

    it("falls back to 'vs last month' when the backend sends no dates", () => {
        show({ income: 1, expenses: 1, savings: 0, incomeTrend: 5, expenseTrend: 5, savingsTrend: 5, compared: {} });

        expect(screen.getAllByText("This month · vs last month")).toHaveLength(3);
        expect(screen.getByTestId("trend-Total Income")).toHaveTextContent("+5%");
    });
});
