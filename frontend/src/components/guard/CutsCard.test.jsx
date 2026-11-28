import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const guard = vi.hoisted(() => vi.fn());
vi.mock("../../services/guardApi", () => ({ guard, guardError: () => "Something went wrong." }));

import CutsCard from "./CutsCard";

const PROPOSAL = {
    eventId: "e1", amount: 2000, source: "ai", message: "₹1,200 from Shopping and ₹800 from next month's budgets.",
    cuts: [{ kind: "category", name: "Shopping", amount: 1200 }, { kind: "next_month", name: "Next month's budgets", amount: 800 }],
};

describe("CutsCard", () => {
    beforeEach(() => {
        guard.mockReset();
        guard.mockResolvedValue(PROPOSAL);
    });

    it("has the suggestion ready after Pay anyway, with goals protected", async () => {
        render(<CutsCard eventId="e1" amount={2000} reason="This took your Food budget over." autoSuggest />);
        expect(await screen.findByText("-₹800")).toBeInTheDocument();
        expect(screen.getByText("Spread over next month's everyday budgets")).toBeInTheDocument();
        expect(guard).toHaveBeenCalledTimes(1);
        expect(guard).toHaveBeenCalledWith("rebalance", { eventId: "e1", allowGoals: false });
    });

    it("asks again with goals allowed only when the user ticks it", async () => {
        render(<CutsCard eventId="e1" amount={2000} reason="" autoSuggest />);
        fireEvent.click(await screen.findByLabelText(/Let goal savings give too/));
        await waitFor(() => expect(guard).toHaveBeenLastCalledWith("rebalance", { eventId: "e1", allowGoals: true }));
    });

    it("waits to be asked without autoSuggest", () => {
        render(<CutsCard eventId="e1" amount={2000} reason="" />);
        expect(guard).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Suggest where it comes from" })).toBeInTheDocument();
    });
});
