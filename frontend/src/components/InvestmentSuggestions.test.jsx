import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockAdapter from "axios-mock-adapter";

import API from "../services/api";
import InvestmentSuggestions from "./InvestmentSuggestions";

const FOUND = [
    { name: "Zerodha Portfolio", type: "Stocks", investedAmount: 25000, currentValue: 25000,
      purchaseDate: "2026-04-02", payments: 5 },
    { name: "SARA CAPITAL SERVICES", type: "Other", investedAmount: 5000, currentValue: 5000,
      purchaseDate: "2026-07-11", payments: 2 },
];

let mock;
beforeEach(() => { mock = new MockAdapter(API); });

describe("InvestmentSuggestions", () => {
    it("stays out of the way until opened", async () => {
        mock.onGet("/portfolio/auto-detect").reply(200, FOUND);
        const user = userEvent.setup();
        render(<InvestmentSuggestions />);

        expect(await screen.findByText("₹30,000 across 7 payments looks like investing")).toBeInTheDocument();
        expect(screen.queryByText("Zerodha Portfolio")).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { expanded: false }));
        expect(screen.getByText("Zerodha Portfolio")).toBeInTheDocument();
        expect(screen.getByText(/Stocks · ₹25,000 · 5 payments · since Apr 2026/)).toBeInTheDocument();
    });

    it("adds one to the portfolio and tells the page to reload", async () => {
        mock.onGet("/portfolio/auto-detect").reply(200, FOUND);
        mock.onPost("/portfolio").reply(200, {});
        const onAdded = vi.fn();
        const user = userEvent.setup();
        render(<InvestmentSuggestions onAdded={onAdded} />);
        await user.click(await screen.findByRole("button", { expanded: false }));

        await user.click(screen.getAllByRole("button", { name: /add to portfolio/i })[1]);

        await waitFor(() => expect(onAdded).toHaveBeenCalled());
        expect(JSON.parse(mock.history.post[0].data)).toEqual({
            name: "SARA CAPITAL SERVICES", type: "Other", investedAmount: 5000,
            currentValue: 5000, purchaseDate: "2026-07-11",
        });
        expect(screen.queryByText("SARA CAPITAL SERVICES")).not.toBeInTheDocument();
        expect(screen.getByText("Zerodha Portfolio")).toBeInTheDocument();
    });

    it("lets the user say one isn't an investment", async () => {
        mock.onGet("/portfolio/auto-detect").reply(200, FOUND);
        const user = userEvent.setup();
        render(<InvestmentSuggestions />);
        await user.click(await screen.findByRole("button", { expanded: false }));

        await user.click(screen.getAllByRole("button", { name: /not an investment/i })[0]);

        expect(screen.queryByText("Zerodha Portfolio")).not.toBeInTheDocument();
        expect(screen.getByText("₹5,000 across 2 payments looks like investing")).toBeInTheDocument();
        expect(mock.history.post).toHaveLength(0);
    });

    it("shows nothing when there is nothing to suggest", async () => {
        mock.onGet("/portfolio/auto-detect").reply(200, []);
        const { container } = render(<InvestmentSuggestions />);
        await waitFor(() => expect(container).toBeEmptyDOMElement());
    });
});
