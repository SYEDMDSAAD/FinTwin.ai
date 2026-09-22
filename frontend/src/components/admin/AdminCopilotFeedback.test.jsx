import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockAdapter from "axios-mock-adapter";

import API from "../../services/api";
import AdminCopilotFeedback from "./AdminCopilotFeedback";

let mock;
beforeEach(() => { mock = new MockAdapter(API); });

describe("AdminCopilotFeedback", () => {
    it("shows the rates, the reasons and each unhelpful answer with its trace", async () => {
        mock.onGet("/admin/copilot/feedback-stats").reply(200, {
            rated: 10, helpful: 7, notHelpful: 3, helpfulRate: 70.0,
            byPath: [
                { path: "portfolio_direct", helpful: 4, notHelpful: 0, helpfulRate: 100.0 },
                { path: "tools", helpful: 3, notHelpful: 3, helpfulRate: 50.0 },
            ],
            reasons: { WRONG_NUMBERS: 2, TOO_LONG: 1 },
            recentNotHelpful: [{
                question: "how much on food last month?", answer: "You spent ₹4,000 on food.",
                reason: "WRONG_NUMBERS", path: "tools",
                trace: JSON.stringify({ path: "tools", outcome: "answered", duration_ms: 12400,
                    tools: [{ name: "get_transactions", args: { category: "Food", months: 1 }, ok: true }] }),
            }],
        });
        const user = userEvent.setup();
        render(<AdminCopilotFeedback />);

        expect(await screen.findByText("70%")).toBeInTheDocument();
        expect(screen.getByText("Answered from the figures (no model)")).toBeInTheDocument();
        expect(screen.getByText("50%")).toBeInTheDocument();
        expect(screen.getAllByText("Wrong numbers").length).toBeGreaterThan(0);

        await user.click(screen.getByRole("button", { name: /how much on food last month/ }));
        expect(screen.getByText("You spent ₹4,000 on food.")).toBeInTheDocument();
        expect(screen.getByText(/get_transactions\(category=Food, months=1\)/)).toBeInTheDocument();
        expect(screen.getByText(/12\.4 s/)).toBeInTheDocument();
    });

    it("says when there is nothing yet", async () => {
        mock.onGet("/admin/copilot/feedback-stats").reply(200, {
            rated: 0, helpful: 0, notHelpful: 0, helpfulRate: null, byPath: [], reasons: {}, recentNotHelpful: [] });
        render(<AdminCopilotFeedback />);
        expect(await screen.findByText(/none to show yet/i)).toBeInTheDocument();
    });
});
