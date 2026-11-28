import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

const native = vi.hoisted(() => ({ on: false }));
const invest = vi.hoisted(() => ({ value: null }));
vi.mock("../native", () => ({ isNativeApp: () => native.on }));
vi.mock("./SpendGuardCard", () => ({ default: () => null }));
vi.mock("../hooks/useInvestData", () => ({ default: () => invest.value }));
// recharts needs a real layout; the chart itself isn't under test here
vi.mock("recharts", () => {
    const Box = ({ children }) => <div>{children}</div>;
    const Svg = ({ children }) => <svg>{children}</svg>;
    return { ResponsiveContainer: Box, AreaChart: Svg, Area: () => null, Line: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null };
});

import HomeOverview from "./HomeOverview";

const realMatchMedia = window.matchMedia;
const screenIs = (wide) => {
    window.matchMedia = () => ({ matches: wide, addEventListener() {}, removeEventListener() {} });
};

const PORTFOLIO = {
    currentValue: 170734, totalInvested: 153200, totalPnl: 17534, totalPnlPercent: 11.44, xirr: 8.9,
    holdings: [
        { id: 1, name: "Parag Parikh Flexi Cap Fund", type: "Mutual Fund", currentValue: 71800, pnl: 11800, pnlPercent: 19.67 },
        { id: 2, name: "Public Provident Fund", type: "PPF", currentValue: 54744, pnl: 6744, pnlPercent: 14.05 },
        { id: 3, name: "Tata Consultancy Services", type: "Stocks", currentValue: 10290, pnl: -4910, pnlPercent: -32.3 },
    ],
};
const READY = {
    loading: false, portfolio: PORTFOLIO, history: null,
    sips: [{ id: 1, fundName: "Parag Parikh Flexi Cap Fund", amount: 5000, frequency: "Monthly", nextDebitDate: "2099-12-05" }],
    health: { checks: [{ id: "concentration", tone: "warn", title: "Parag Parikh Flexi Cap Fund is 42% of your portfolio", detail: "If it falls 20%…" }] },
};

const props = {
    income: 72000, spent: 53760, budgets: [], notifications: [],
    goals: [{ id: 1, title: "Goa trip", progressPercent: 62 }],
    scoreData: { score: 71 }, netWorth: { netWorth: 608913 },
    navigateTo: () => {},
};

describe("Home, investing first", () => {
    afterEach(() => { window.matchMedia = realMatchMedia; native.on = false; invest.value = null; });

    it("opens on the portfolio on a phone, with SIPs, spare money and the top insight", () => {
        screenIs(false);
        invest.value = READY;
        render(<HomeOverview {...props} />);
        expect(screen.getByRole("region", { name: "Portfolio value" })).toHaveTextContent("₹1,70,734");
        expect(screen.getByText(/a month/)).toBeInTheDocument();                    // SIPs total
        expect(screen.getByRole("button", { name: /Spare this month/ })).toHaveTextContent("₹18,240"); // 72,000 − 53,760
        expect(screen.getByText(/42% of your portfolio/)).toBeInTheDocument();
        expect(screen.getByRole("region", { name: "Allocation" })).toHaveTextContent("Equity");
        expect(screen.getByRole("region", { name: "Your money" })).toBeInTheDocument();
    });

    it("asks for a CAS when there's nothing invested yet", () => {
        screenIs(false);
        invest.value = { ...READY, portfolio: { holdings: [] } };
        render(<HomeOverview {...props} />);
        expect(screen.getByRole("button", { name: "Import your CAS" })).toBeInTheDocument();
    });

    it("lays the same facts out as a dashboard on a computer screen", () => {
        screenIs(true);
        invest.value = READY;
        render(<HomeOverview {...props} />);
        expect(screen.getByRole("region", { name: "Portfolio value" })).toBeInTheDocument();
        expect(screen.getByText("Biggest holdings")).toBeInTheDocument();
        expect(screen.getByRole("region", { name: "Goals" })).toHaveTextContent("Goa trip");
        expect(screen.queryByRole("region", { name: "Your money" })).not.toBeInTheDocument();
    });

    it("keeps the phone layout in the Android app, whatever the screen", () => {
        screenIs(true);
        native.on = true;
        invest.value = READY;
        render(<HomeOverview {...props} />);
        expect(screen.getByRole("region", { name: "Your money" })).toBeInTheDocument();
        expect(screen.queryByText("Biggest holdings")).toBeInTheDocument();          // the phone peek shows 3
        expect(screen.queryByRole("region", { name: "Goals" })).not.toBeInTheDocument();
    });
});
