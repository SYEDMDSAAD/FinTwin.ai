import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";

import API from "../services/api";
import InvestmentPlanSection from "./InvestmentPlanSection";

const PLAN = {
    monthlyIncome: 80000, monthlySpend: 55000, monthlySurplus: 25000,
    emergency: { saved: 110000, monthsCovered: 2, targetMonths: 6, shortfall: 220000 },
    goals: [{ id: 1, title: "Goa Trip", target: 60000, saved: 20000, monthsLeft: 4, monthlyNeeded: 10000 }],
    goalsMonthlyNeeded: 10000, leftAfterGoals: 15000, sipMonthly: 6000, portfolioValue: 100000,
    mix: [{ type: "Mutual Fund", value: 75000, percent: 75 }, { type: "Stock", value: 25000, percent: 25 }],
};

let mock;
beforeEach(() => { mock = new MockAdapter(API); });

describe("InvestmentPlanSection", () => {
    it("shows the user's own numbers and never a suggested mix", async () => {
        mock.onGet("/investments/plan").reply(200, PLAN);
        render(<InvestmentPlanSection />);
        expect(await screen.findByText("Goa Trip")).toBeInTheDocument();
        expect(screen.getByText(/Covers 2 months of spending/)).toBeInTheDocument();
        expect(screen.getByText(/4 months left/)).toBeInTheDocument();
        expect(screen.getByText("Left after goals")).toBeInTheDocument();
        expect(screen.getByText("Where your money is now")).toBeInTheDocument();
        expect(screen.queryByText(/Suggested mix|Risk profile|Expected return/)).not.toBeInTheDocument();
    });

    it("says when goals need more than is left over", async () => {
        mock.onGet("/investments/plan").reply(200, { ...PLAN, leftAfterGoals: -4000 });
        render(<InvestmentPlanSection />);
        expect(await screen.findByText("Short each month")).toBeInTheDocument();
    });

    it("offers a retry when the plan can't load", async () => {
        mock.onGet("/investments/plan").reply(500);
        render(<InvestmentPlanSection />);
        expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    });
});
