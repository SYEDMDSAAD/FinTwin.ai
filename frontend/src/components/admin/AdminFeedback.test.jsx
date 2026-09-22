import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockAdapter from "axios-mock-adapter";

import API from "../../services/api";
import AdminFeedback from "./AdminFeedback";

const REPORT = {
    total: 3, userCount: 2, averageRating: 4,
    ratingCounts: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 2 },
    topFeatures: [{ name: "Imports", count: 2 }, { name: "AI Copilot", count: 1 }],
    users: [
        { email: "asha@example.com", name: "Asha Rao", count: 2, latestRating: 5, lastSubmittedAt: "2026-09-21T10:00:00",
          feedback: [
              { id: 2, rating: 5, useful: ["Imports", "AI Copilot"], improve: "More banks", broken: null, submittedAt: "2026-09-21T10:00:00" },
              { id: 1, rating: 3, useful: [], improve: null, broken: "PDF import\nwas slow", submittedAt: "2026-09-20T09:00:00" },
          ] },
        { email: "ravi@example.com", name: "Ravi K", count: 1, latestRating: 5, lastSubmittedAt: "2026-09-19T08:00:00",
          feedback: [{ id: 3, rating: 5, useful: ["Imports"], improve: "Dark mode", broken: null, submittedAt: "2026-09-19T08:00:00" }] },
    ],
};

let mock;
beforeEach(() => {
    mock = new MockAdapter(API);
    mock.onGet("/admin/feedback").reply(200, REPORT);
});

describe("AdminFeedback", () => {
    it("lists every user who sent feedback with the totals", async () => {
        render(<AdminFeedback />);
        expect(await screen.findByText("Asha Rao")).toBeInTheDocument();
        expect(screen.getByText("ravi@example.com")).toBeInTheDocument();
        expect(screen.getByText("4 / 5")).toBeInTheDocument();
        expect(screen.getByText("2 responses")).toBeInTheDocument();
    });

    it("opens a user to show each of their responses in full", async () => {
        const user = userEvent.setup();
        render(<AdminFeedback />);
        await user.click(await screen.findByRole("button", { name: /asha rao/i }));

        const row = screen.getByRole("button", { name: /asha rao/i }).parentElement;
        expect(within(row).getByText("More banks")).toBeInTheDocument();
        expect(within(row).getByText(/PDF import\s+was slow/)).toBeInTheDocument();
        expect(within(row).getByText("None picked")).toBeInTheDocument();
        expect(screen.queryByText("Dark mode")).not.toBeInTheDocument();
    });

    it("filters by rating and by name", async () => {
        const user = userEvent.setup();
        render(<AdminFeedback />);
        await screen.findByText("Asha Rao");

        await user.click(screen.getByRole("button", { name: "3★" }));
        expect(screen.queryByText("Ravi K")).not.toBeInTheDocument();
        expect(screen.getByText("Asha Rao")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "All" }));
        await user.type(screen.getByLabelText(/search users/i), "ravi");
        expect(screen.queryByText("Asha Rao")).not.toBeInTheDocument();
    });

    it("says so when there's no feedback yet", async () => {
        mock.onGet("/admin/feedback").reply(200, { total: 0, userCount: 0, averageRating: 0, ratingCounts: {}, topFeatures: [], users: [] });
        render(<AdminFeedback />);
        expect(await screen.findByText(/no feedback yet/i)).toBeInTheDocument();
    });
});
