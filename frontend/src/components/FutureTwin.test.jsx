import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockAdapter from "axios-mock-adapter";

import API from "../services/api";
import FutureTwin from "./FutureTwin";

let mock;
beforeEach(() => {
    mock = new MockAdapter(API);
    try { localStorage.clear(); } catch { /* ignore */ }
});

const TWIN = {
    portfolioValue: 200000, sipMonthly: 5000,
    roundUps: { month: "2026-10", amount: 412, payments: 61 },
    pausedThisMonth: 2588, pausedTotal: 9100,
    wishlistReady: [{ name: "Headphones", amount: 3499, readySince: "2026-11-25" }],
};

describe("FutureTwin", () => {
    it("shows how far ahead the twin gets and how to make it real", async () => {
        mock.onGet("/twin").reply(200, TWIN);
        const onOpenSips = vi.fn();
        const user = userEvent.setup();
        render(<FutureTwin onOpenSips={onOpenSips} />);
        expect(await screen.findByText(/By also investing ₹3,000 a month/)).toBeInTheDocument();
        expect(screen.getByText(/Round-ups: ₹412 a month/)).toBeInTheDocument();
        expect(screen.getByText("Headphones")).toBeInTheDocument();
        expect(screen.getByText(/an assumption you chose, not a promise/)).toBeInTheDocument();

        await user.click(screen.getByRole("checkbox", { name: /Round-ups/ }));
        expect(screen.getByText(/By also investing ₹2,588 a month/)).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Go to SIPs" }));
        expect(onOpenSips).toHaveBeenCalled();
    });

    it("explains the twin when there's nothing extra yet", async () => {
        mock.onGet("/twin").reply(200, { portfolioValue: 0, sipMonthly: 0, roundUps: { amount: 0, payments: 0 }, pausedThisMonth: 0, pausedTotal: 0, wishlistReady: [] });
        render(<FutureTwin />);
        expect(await screen.findByText(/Your twin invests what you don't spend/)).toBeInTheDocument();
        expect(screen.queryByText("Make your twin real")).not.toBeInTheDocument();
    });
});
