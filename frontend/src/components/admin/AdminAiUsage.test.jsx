import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockAdapter from "axios-mock-adapter";

import API from "../../services/api";
import AdminAiUsage from "./AdminAiUsage";

let mock;
beforeEach(() => { mock = new MockAdapter(API); });

const SUMMARY = {
    days: 30, from: "2026-08-26", to: "2026-09-24",
    totals: { inputTokens: 96000, outputTokens: 9600, totalTokens: 105600, calls: 33, activeUsers: 2 },
    byFeature: [
        { feature: "copilot", inputTokens: 90000, outputTokens: 9000, totalTokens: 99000, calls: 30, users: 1 },
        { feature: "coach", inputTokens: 6000, outputTokens: 600, totalTokens: 6600, calls: 3, users: 2 },
    ],
    daily: [{ date: "2026-09-24", inputTokens: 96000, outputTokens: 9600, calls: 33 }],
    users: [
        { userId: 1, email: "asha@example.com", fullName: "Asha Rao", inputTokens: 95000, outputTokens: 9500,
          totalTokens: 104500, calls: 32, lastUsed: "2026-09-24",
          byFeature: {
              coach: { inputTokens: 5000, outputTokens: 500, totalTokens: 5500, calls: 2 },
              copilot: { inputTokens: 90000, outputTokens: 9000, totalTokens: 99000, calls: 30 },
          } },
        { userId: 2, email: "ravi@example.com", fullName: "Ravi K", inputTokens: 1000, outputTokens: 100,
          totalTokens: 1100, calls: 1, lastUsed: "2026-09-23",
          byFeature: { coach: { inputTokens: 1000, outputTokens: 100, totalTokens: 1100, calls: 1 } } },
    ],
    userCount: 2,
};

describe("AdminAiUsage", () => {
    it("shows totals, each feature and each user, with a user's per-feature split on demand", async () => {
        mock.onGet("/admin/ai-usage").reply(200, SUMMARY);
        const user = userEvent.setup();
        render(<AdminAiUsage />);

        expect(await screen.findByText("106K")).toBeInTheDocument();          // total tokens
        expect(screen.getAllByText("Copilot").length).toBeGreaterThan(0);
        expect(screen.getByText("30 calls · 1 user")).toBeInTheDocument();
        expect(screen.getByText("Asha Rao")).toBeInTheDocument();
        expect(screen.getByText("ravi@example.com")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: /Asha Rao/ }));
        const split = screen.getByRole("table", { name: /AI usage by feature for Asha Rao/ });
        expect(within(split).getByText("99,000")).toBeInTheDocument();
        expect(within(split).getByText("95%")).toBeInTheDocument();
        expect(within(split).getByText("Spending coach")).toBeInTheDocument();
    });

    it("asks for the chosen range", async () => {
        mock.onGet("/admin/ai-usage", { params: { days: 30 } }).reply(200, SUMMARY);
        mock.onGet("/admin/ai-usage", { params: { days: 7 } }).reply(200, { ...SUMMARY, days: 7 });
        const user = userEvent.setup();
        render(<AdminAiUsage />);
        await screen.findByText("Asha Rao");

        await user.click(screen.getByRole("button", { name: "7 days" }));
        expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
        expect(mock.history.get.at(-1).params).toEqual({ days: 7 });
    });

    it("says 1 call, not 1 calls", async () => {
        mock.onGet("/admin/ai-usage").reply(200, {
            ...SUMMARY,
            byFeature: [{ feature: "report", inputTokens: 700, outputTokens: 112, totalTokens: 812, calls: 1, users: 1 }],
        });
        render(<AdminAiUsage />);
        expect(await screen.findByText("1 call · 1 user")).toBeInTheDocument();
    });

    it("says so when nothing was used", async () => {
        mock.onGet("/admin/ai-usage").reply(200, {
            ...SUMMARY, totals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0, activeUsers: 0 },
            byFeature: [], daily: [], users: [], userCount: 0,
        });
        render(<AdminAiUsage />);
        expect(await screen.findByText("No AI usage recorded in the last 30 days.")).toBeInTheDocument();
    });
});
