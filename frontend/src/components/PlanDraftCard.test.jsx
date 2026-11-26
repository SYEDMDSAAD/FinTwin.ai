import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../services/api", () => ({ default: api }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import PlanDraftCard, { changedLines } from "./PlanDraftCard";

const DRAFT = {
    salary: { payer: "ACME PVT LTD", typicalAmount: 52000, typicalDay: 1, months: 3 },
    monthsUsed: 3,
    budgets: [
        { category: "Rent", typical: 15000, suggested: 15000, essential: true, currentLimit: 15000, reason: "Usually ₹15,000 a month. Kept as it is." },
        { category: "Food", typical: 3000, suggested: 2700, essential: false, currentLimit: null, reason: "Usually ₹3,000 a month. Set 10% lower so more is left to save." },
        { category: "Shopping", typical: 2000, suggested: 1800, essential: false, currentLimit: 4000, reason: "Usually ₹2,000 a month." },
    ],
};

describe("changedLines", () => {
    it("drops lines that already match", () => {
        expect(changedLines(DRAFT.budgets).map((b) => b.category)).toEqual(["Food", "Shopping"]);
    });
});

describe("PlanDraftCard", () => {
    beforeEach(() => {
        localStorage.clear();
        api.get.mockReset();
        api.post.mockReset();
        api.get.mockResolvedValue({ data: DRAFT });
        api.post.mockResolvedValue({ data: { created: 1, updated: 0, unchanged: 0 } });
    });

    it("saves only the lines the user kept, with their edits", async () => {
        const onApplied = vi.fn();
        render(<PlanDraftCard hasBudgets={false} onApplied={onApplied} />);
        const food = await screen.findByLabelText("Food budget");
        expect(screen.getByText(/Salary of about ₹52,000 from ACME PVT LTD, usually on the 1st/)).toBeInTheDocument();

        await userEvent.clear(food);
        await userEvent.type(food, "3000");
        await userEvent.click(screen.getByLabelText("Include Shopping"));
        await userEvent.click(screen.getByRole("button", { name: "Use this plan" }));

        await waitFor(() => expect(api.post).toHaveBeenCalledWith("/plan/budgets", {
            budgets: [{ category: "Food", limit: 3000 }],
        }));
        expect(onApplied).toHaveBeenCalled();
    });

    it("is folded away when the user already has budgets", async () => {
        render(<PlanDraftCard hasBudgets onApplied={() => {}} />);
        await userEvent.click(await screen.findByRole("button", { name: "Review 2 suggestions" }));
        expect(screen.getByLabelText("Food budget")).toBeInTheDocument();
    });

    it("shows nothing when there's nothing to suggest", async () => {
        api.get.mockResolvedValue({ data: { ...DRAFT, budgets: [] } });
        const { container } = render(<PlanDraftCard hasBudgets onApplied={() => {}} />);
        await waitFor(() => expect(api.get).toHaveBeenCalled());
        expect(container).toBeEmptyDOMElement();
    });
});
