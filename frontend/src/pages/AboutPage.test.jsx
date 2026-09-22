import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";
import API from "../services/api";
import userEvent from "@testing-library/user-event";

import AboutPage from "./AboutPage";

describe("AboutPage", () => {
    it("introduces the app and says it's a beta", () => {
        render(<AboutPage navigateTo={() => {}} />);
        expect(screen.getByRole("heading", { level: 1, name: /fintwin\.ai/i })).toBeInTheDocument();
        const beta = screen.getByRole("complementary", { name: /beta notice/i });
        expect(beta).toHaveTextContent(/welcome to fintwin\.ai/i);
        expect(beta).toHaveTextContent(/beta build for testing/i);
        expect(beta).toHaveTextContent(/not financial advice/i);
    });

    it("describes every sidebar section and opens it on click", async () => {
        const navigateTo = vi.fn();
        render(<AboutPage navigateTo={navigateTo} />);
        const sections = ["Dashboard", "Analytics", "Transactions", "AI Intelligence", "AI Copilot",
            "AI Spending Coach", "Goals Planner", "Budgeting", "Net Worth", "Investments", "Insurance",
            "Imports", "OCR Uploads", "Executive Reports", "Settings"];
        const guide = screen.getByRole("region", { name: "Finance" }).parentElement;
        for (const name of sections) {
            expect(within(guide).getAllByRole("button", { name: new RegExp(`^${name}\\b`) })[0]).toBeInTheDocument();
        }
        await userEvent.setup().click(within(screen.getByRole("region", { name: "Finance" })).getByRole("button", { name: /^Investments\b/ }));
        expect(navigateTo).toHaveBeenCalledWith("Investments");
    });
});

describe("feedback form", () => {
    let mock;
    beforeEach(() => { mock = new MockAdapter(API); });

    const form = () => within(screen.getByRole("region", { name: /help us improve/i }));

    it("sends the rating, the features picked and the answers", async () => {
        const user = userEvent.setup();
        render(<AboutPage navigateTo={() => {}} />);
        mock.onPost("/feedback").reply(200, { message: "Thanks", ticketId: 7 });

        await user.click(form().getByRole("button", { name: "4 stars" }));
        await user.click(form().getByRole("button", { name: "AI Copilot" }));
        await user.click(form().getByRole("button", { name: "Imports" }));
        await user.type(form().getByLabelText(/what should we improve/i), "More banks");
        await user.click(form().getByRole("button", { name: /send feedback/i }));

        expect(await screen.findByText(/your feedback was sent/i)).toBeInTheDocument();
        expect(JSON.parse(mock.history.post[0].data)).toEqual({
            rating: 4, useful: ["AI Copilot", "Imports"], improve: "More banks", broken: "",
        });
    });

    it("won't send without a rating", async () => {
        const user = userEvent.setup();
        render(<AboutPage navigateTo={() => {}} />);
        await user.click(form().getByRole("button", { name: /send feedback/i }));
        expect(mock.history.post).toHaveLength(0);
    });
});
