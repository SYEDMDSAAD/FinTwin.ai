import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockAdapter from "axios-mock-adapter";

import API from "../services/api";
import SpendingHeatmap from "./SpendingHeatmap";

const TOTALS = {
    categories: [
        { category: "Food", total: 82400, count: 412 },
        { category: "Transport", total: 31000, count: 120 },
    ],
    transactions: 4812, from: "2024-06-03", to: "2026-09-21",
};

let mock;
beforeEach(() => { mock = new MockAdapter(API); });

describe("SpendingHeatmap", () => {
    it("covers everything imported, not just recent months", async () => {
        mock.onGet("/transactions/category-totals").reply(cfg => {
            expect(cfg.params).toEqual({ months: 0 });           // 0 = the user's whole history
            return [200, TOTALS];
        });
        render(<SpendingHeatmap />);

        expect(await screen.findByText("Food")).toBeInTheDocument();
        expect(screen.getByText(/Jun 2024 –.*2026 · 4,812 transactions/)).toBeInTheDocument();
        expect(screen.getByText("Transport")).toBeInTheDocument();
    });

    it("loads a category's own transactions when it is opened", async () => {
        mock.onGet("/transactions/category-totals").reply(200, TOTALS);
        mock.onGet("/transactions").reply(cfg => {
            expect(cfg.params).toEqual({ months: 0, category: "Food" });
            return [200, [
                { id: 7, merchant: "Paid to SWIGGY", category: "Food", date: "2025-02-11", amount: -420 },
                { id: 8, merchant: "Salary", category: "Food", date: "2025-02-12", amount: 900 },  // income is left out
            ]];
        });
        const user = userEvent.setup();
        render(<SpendingHeatmap />);

        await user.click(await screen.findByRole("button", { name: /Food/ }));

        expect(await screen.findByText("1 transaction")).toBeInTheDocument();
        expect(screen.getByText("Paid to SWIGGY")).toBeInTheDocument();
        expect(screen.queryByText("Salary")).not.toBeInTheDocument();
    });

    it("lists a category's transactions biggest first", async () => {
        mock.onGet("/transactions/category-totals").reply(200, TOTALS);
        mock.onGet("/transactions").reply(200, [
            { id: 1, merchant: "Paid to ZOMATO", category: "Food", date: "2026-03-02", amount: -300 },
            { id: 2, merchant: "Paid to SWIGGY", category: "Food", date: "2024-07-15", amount: -420 },
            { id: 3, merchant: "Paid to CHAAYOS", category: "Food", date: "2025-11-30", amount: -150 },
        ]);
        const user = userEvent.setup();
        render(<SpendingHeatmap />);

        await user.click(await screen.findByRole("button", { name: /Food/ }));
        await screen.findByText("3 transactions");

        const shown = screen.getAllByText(/^Paid to (ZOMATO|SWIGGY|CHAAYOS)$/).map(el => el.textContent);
        expect(shown.slice(0, 3)).toEqual(["Paid to SWIGGY", "Paid to ZOMATO", "Paid to CHAAYOS"]);   // 420, 300, 150
    });

    it("re-adds the totals after a category is corrected", async () => {
        mock.onGet("/transactions/category-totals").reply(200, TOTALS);
        mock.onGet("/transactions").reply(200, [{ id: 7, merchant: "Paid to BLINKIT", category: "Food", date: "2025-02-11", amount: -420 }]);
        mock.onPatch("/transactions/7/category").reply(200, {});
        const onCategoryChanged = vi.fn();
        const user = userEvent.setup();
        render(<SpendingHeatmap onCategoryChanged={onCategoryChanged} />);

        await user.click(await screen.findByRole("button", { name: /Food/ }));
        await screen.findByText("1 transaction");
        // the row's category picker is a custom dropdown, not a <select>
        const pickers = await screen.findAllByRole("button", { name: "Food" });
        await user.click(pickers.at(-1));
        await user.click(await screen.findByText("Groceries"));

        await waitFor(() => expect(onCategoryChanged).toHaveBeenCalled());
        expect(mock.history.get.filter(r => r.url === "/transactions/category-totals")).toHaveLength(2);
    });

    it("says so when the totals can't be loaded", async () => {
        mock.onGet("/transactions/category-totals").reply(500);
        render(<SpendingHeatmap />);
        expect(await screen.findByText(/could not load your spending/i)).toBeInTheDocument();
    });
});
