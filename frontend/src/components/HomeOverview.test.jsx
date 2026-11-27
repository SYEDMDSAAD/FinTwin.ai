import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

const native = vi.hoisted(() => ({ on: false }));
vi.mock("../native", () => ({ isNativeApp: () => native.on }));
vi.mock("./SpendGuardCard", () => ({ default: () => null }));
// recharts needs a real layout; the chart itself isn't under test here
vi.mock("recharts", () => {
    const Box = ({ children }) => <div>{children}</div>;
    const Svg = ({ children }) => <svg>{children}</svg>;
    return { ResponsiveContainer: Box, AreaChart: Svg, Area: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null };
});

import HomeOverview from "./HomeOverview";

const realMatchMedia = window.matchMedia;
const screenIs = (wide) => {
    window.matchMedia = () => ({ matches: wide, addEventListener() {}, removeEventListener() {} });
};

const props = {
    income: 72000, spent: 53760, budgets: [], notifications: [],
    goals: [{ id: 1, title: "Goa trip", progressPercent: 62, targetAmount: 45000, currentAmount: 27900 }],
    scoreData: { score: 71 }, netWorth: { netWorth: 608913 },
    monthlyHistory: [{ month: "2026-10", expense: 61000 }, { month: "2026-11", expense: 53760 }],
    navigateTo: () => {},
};

describe("HomeOverview layouts", () => {
    afterEach(() => { window.matchMedia = realMatchMedia; native.on = false; });

    it("lays Home out as a dashboard on a computer screen", () => {
        screenIs(true);
        render(<HomeOverview {...props} />);
        expect(screen.getByRole("region", { name: "Spending by month" })).toBeInTheDocument();
        expect(screen.getByText("Goa trip")).toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Your money" })).not.toBeInTheDocument();
    });

    it("keeps the phone layout on a small screen", () => {
        screenIs(false);
        render(<HomeOverview {...props} />);
        expect(screen.getByRole("region", { name: "Your money" })).toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Spending by month" })).not.toBeInTheDocument();
    });

    it("keeps the phone layout in the Android app, whatever the screen", () => {
        screenIs(true);
        native.on = true;
        render(<HomeOverview {...props} />);
        expect(screen.getByRole("region", { name: "Your money" })).toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Spending by month" })).not.toBeInTheDocument();
    });
});
