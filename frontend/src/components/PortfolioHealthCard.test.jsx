import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockAdapter from "axios-mock-adapter";

import API from "../services/api";
import PortfolioHealthCard from "./PortfolioHealthCard";

let mock;
beforeEach(() => { mock = new MockAdapter(API); });

describe("PortfolioHealthCard", () => {
    it("lists the checks and the funds behind the tax-free gains", async () => {
        mock.onGet("/portfolio/health").reply(200, {
            checks: [
                { id: "regular", tone: "warn", title: "HDFC Flexi Cap is a Regular plan", detail: "Regular plans pay a distributor…" },
                { id: "tax", tone: "good", title: "About ₹40,000 of gains could be booked tax-free", detail: "The first ₹1.25 lakh…" },
            ],
            tax: { harvestable: 40000, holdings: [{ id: 1, name: "Parag Parikh Flexi Cap", gain: 40000, units: 210.5 }] },
        });
        const user = userEvent.setup();
        render(<PortfolioHealthCard />);
        expect(await screen.findByText("HDFC Flexi Cap is a Regular plan")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Which funds" }));
        expect(screen.getByText("Parag Parikh Flexi Cap")).toBeInTheDocument();
        expect(screen.getByText(/210.5 units/)).toBeInTheDocument();
    });

    it("stays hidden when there's nothing to say", async () => {
        mock.onGet("/portfolio/health").reply(200, { checks: [], tax: null });
        const { container } = render(<PortfolioHealthCard />);
        await new Promise((r) => setTimeout(r, 20));
        expect(container).toBeEmptyDOMElement();
    });
});
