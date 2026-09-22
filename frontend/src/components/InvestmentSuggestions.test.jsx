import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockAdapter from "axios-mock-adapter";

import API from "../services/api";
import InvestmentSuggestions from "./InvestmentSuggestions";

const FOUND = [
    { name: "Zerodha Portfolio", type: "Stocks", investedAmount: 25000, currentValue: 25000,
      purchaseDate: "2026-04-02", payments: 5,
      breakdown: [{ date: "2026-04-02", amount: 5000 }, { date: "2026-05-02", amount: 5000 },
                  { date: "2026-06-02", amount: 5000 }, { date: "2026-07-02", amount: 5000 },
                  { date: "2026-08-02", amount: 5000 }] },
    { name: "SARA CAPITAL SERVICES", type: "Other", investedAmount: 5000, currentValue: 5000,
      purchaseDate: "2026-07-11", payments: 2,
      breakdown: [{ date: "2026-07-11", amount: 3000 }, { date: "2026-08-11", amount: 2000 }] },
];
const SIP = [{ name: "Parag Parikh Flexi Cap", type: "Mutual Fund", investedAmount: 9000, currentValue: 9000,
               purchaseDate: "2026-06-05", payments: 3,
               breakdown: [{ date: "2026-06-05", amount: 3000 }, { date: "2026-07-05", amount: 3000 },
                           { date: "2026-08-05", amount: 3000 }] }];

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

    it("adds each payment as its own holding — seven payments can be seven investments", async () => {
        mock.onGet("/portfolio/auto-detect").reply(200, FOUND);
        mock.onPost("/portfolio").reply(200, {});
        const user = userEvent.setup();
        render(<InvestmentSuggestions />);
        await user.click(await screen.findByRole("button", { expanded: false }));

        // an unrecognised payee defaults to one holding per payment
        expect(screen.getByLabelText("How to add SARA CAPITAL SERVICES")).toHaveValue("separate");
        await user.click(screen.getAllByRole("button", { name: /add to portfolio/i })[1]);

        await waitFor(() => expect(mock.history.post).toHaveLength(2));
        expect(mock.history.post.map(r => JSON.parse(r.data))).toEqual([
            { name: "SARA CAPITAL SERVICES · 11 Jul 2026", type: "Other", investedAmount: 3000, currentValue: 3000, purchaseDate: "2026-07-11" },
            { name: "SARA CAPITAL SERVICES · 11 Aug 2026", type: "Other", investedAmount: 2000, currentValue: 2000, purchaseDate: "2026-08-11" },
        ]);
    });

    it("keeps monthly payments into one fund as a single holding", async () => {
        mock.onGet("/portfolio/auto-detect").reply(200, SIP);
        mock.onPost("/portfolio").reply(200, {});
        const user = userEvent.setup();
        render(<InvestmentSuggestions />);
        await user.click(await screen.findByRole("button", { expanded: false }));

        expect(screen.getByLabelText("How to add Parag Parikh Flexi Cap")).toHaveValue("one");
        await user.click(screen.getByRole("button", { name: /add to portfolio/i }));

        await waitFor(() => expect(mock.history.post).toHaveLength(1));
        expect(JSON.parse(mock.history.post[0].data)).toMatchObject({
            name: "Parag Parikh Flexi Cap", investedAmount: 9000, purchaseDate: "2026-06-05",
        });
    });

    it("can put a split suggestion back together", async () => {
        mock.onGet("/portfolio/auto-detect").reply(200, FOUND);
        mock.onPost("/portfolio").reply(200, {});
        const user = userEvent.setup();
        render(<InvestmentSuggestions />);
        await user.click(await screen.findByRole("button", { expanded: false }));

        await user.selectOptions(screen.getByLabelText("How to add SARA CAPITAL SERVICES"), "one");
        await user.click(screen.getAllByRole("button", { name: /add to portfolio/i })[1]);

        await waitFor(() => expect(mock.history.post).toHaveLength(1));
        expect(JSON.parse(mock.history.post[0].data)).toMatchObject({
            name: "SARA CAPITAL SERVICES", investedAmount: 5000,
        });
    });

    it("adds one to the portfolio and tells the page to reload", async () => {
        mock.onGet("/portfolio/auto-detect").reply(200, SIP);
        mock.onPost("/portfolio").reply(200, {});
        const onAdded = vi.fn();
        const user = userEvent.setup();
        render(<InvestmentSuggestions onAdded={onAdded} />);
        await user.click(await screen.findByRole("button", { expanded: false }));

        await user.click(screen.getByRole("button", { name: /add to portfolio/i }));

        await waitFor(() => expect(onAdded).toHaveBeenCalled());
        expect(JSON.parse(mock.history.post[0].data)).toEqual({
            name: "Parag Parikh Flexi Cap", type: "Mutual Fund", investedAmount: 9000,
            currentValue: 9000, purchaseDate: "2026-06-05",
        });
        expect(screen.queryByText("Parag Parikh Flexi Cap")).not.toBeInTheDocument();
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
