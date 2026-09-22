import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockAdapter from "axios-mock-adapter";

import API from "../services/api";
import LinkHoldingModal from "./LinkHoldingModal";

vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
import toast from "react-hot-toast";

const HOLDING = { id: 42, name: "Investment Portfolio", type: "Other", investedAmount: 15000, currentValue: 15000 };

const PREVIEW = {
    kind: "FUND", symbol: "122640", purchaseDate: "2025-09-22", purchasePrice: 86.2413,
    units: 173.931, currentPrice: 90.53, amount: 15000,
    currentValue: 15746.39, gain: 746.39, gainPct: 4.98,
};

let mock;
beforeEach(() => {
    mock = new MockAdapter(API);
    vi.clearAllMocks();
});

function open(props = {}) {
    const handlers = { onClose: vi.fn(), onLinked: vi.fn(), onOther: vi.fn(), ...props };
    render(<LinkHoldingModal holding={HOLDING} {...handlers} />);
    return { user: userEvent.setup(), ...handlers };
}

async function pickFund(user) {
    mock.onGet("/discover/funds").reply(200, [
        { code: "122640", name: "Parag Parikh Flexi Cap Fund - Direct Growth", amc: "PPFAS", nav: 90.53 },
    ]);
    await user.click(screen.getByRole("button", { name: /a mutual fund/i }));
    await user.type(screen.getByLabelText(/search mutual funds/i), "parag");
    await user.click(await screen.findByText(/parag parikh flexi cap/i));
}

describe("LinkHoldingModal", () => {
    it("asks about the amount the user entered", () => {
        open();
        expect(screen.getByRole("heading", { name: /where did you invest ₹15,000/i })).toBeInTheDocument();
    });

    it("prices the purchase date and shows today's value", async () => {
        const { user } = open();
        await pickFund(user);
        await user.type(screen.getByLabelText(/date you invested/i), "2025-09-20");

        mock.onPost("/portfolio/value-preview").reply(cfg => {
            expect(JSON.parse(cfg.data)).toEqual({
                kind: "FUND", symbol: "122640", name: "Parag Parikh Flexi Cap Fund - Direct Growth",
                date: "2025-09-20", amount: 15000, units: null,
            });
            return [200, PREVIEW];
        });
        await user.click(screen.getByRole("button", { name: /show today's value/i }));

        const result = await screen.findByRole("status");
        expect(result).toHaveTextContent("173.931 units");
        expect(result).toHaveTextContent("₹86.24");
        expect(result).toHaveTextContent("₹15,746");
        expect(result).toHaveTextContent("+4.98%");
    });

    it("saves the link and tells the portfolio to reload", async () => {
        const { user, onLinked } = open();
        await pickFund(user);
        await user.type(screen.getByLabelText(/date you invested/i), "2025-09-20");
        mock.onPost("/portfolio/value-preview").reply(200, PREVIEW);
        await user.click(screen.getByRole("button", { name: /show today's value/i }));

        mock.onPost("/portfolio/42/link").reply(200, {});
        await user.click(await screen.findByRole("button", { name: /save to my portfolio/i }));

        await waitFor(() => expect(onLinked).toHaveBeenCalled());
        expect(mock.history.post.at(-1).url).toBe("/portfolio/42/link");
    });

    it("can't look up a value until a date is given", async () => {
        const { user } = open();
        await pickFund(user);
        expect(screen.getByRole("button", { name: /show today's value/i })).toBeDisabled();
    });

    it("passes on the server's reason when no price exists for the date", async () => {
        const { user } = open();
        await pickFund(user);
        await user.type(screen.getByLabelText(/date you invested/i), "2001-01-01");
        mock.onPost("/portfolio/value-preview").reply(404, { error: "No NAV for that fund on or after 2001-01-01" });
        await user.click(screen.getByRole("button", { name: /show today's value/i }));

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No NAV for that fund on or after 2001-01-01"));
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("hands anything else back to the ordinary edit form", async () => {
        const { user, onOther } = open();
        await user.click(screen.getByRole("button", { name: /something else/i }));
        expect(onOther).toHaveBeenCalledWith(HOLDING);
    });
});
