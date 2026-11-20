import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SpendGuardCard from "./SpendGuardCard";
import * as guardApi from "../services/guardApi";

vi.mock("../services/guardApi", () => ({ guardEnabled: vi.fn(), guard: vi.fn() }));

const today = new Date().toISOString();

describe("SpendGuardCard", () => {
    beforeEach(() => vi.clearAllMocks());

    it("shows this week at a glance and opens Spend Guard", async () => {
        guardApi.guardEnabled.mockResolvedValue(true);
        guardApi.guard.mockResolvedValue({
            balances: { spending: 3550 }, daysToAllowance: 3, savedByPausing: 1200,
            recent: [{ type: "scan", at: today, decision: "pause" }, { type: "scan", at: today, decision: "go" },
                     { type: "topup", at: today, decision: "approve" }],
        });
        const onOpen = vi.fn();
        render(<SpendGuardCard onOpen={onOpen} />);
        expect(await screen.findByText("₹3,550")).toBeInTheDocument();
        expect(screen.getByText("3 days to your next allowance")).toBeInTheDocument();
        expect(screen.getByText("₹1,200")).toBeInTheDocument();
        expect(screen.getByText("1 paused this week")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /open spend guard/i }));
        expect(onOpen).toHaveBeenCalled();
        expect(guardApi.guard).toHaveBeenCalledWith("wallet");
    });

    it("stays out of the way for accounts Spend Guard isn't open to", async () => {
        guardApi.guardEnabled.mockResolvedValue(false);
        const { container } = render(<SpendGuardCard onOpen={() => {}} />);
        await new Promise((r) => setTimeout(r, 20));
        expect(container).toBeEmptyDOMElement();
        expect(guardApi.guard).not.toHaveBeenCalled();
    });
});
