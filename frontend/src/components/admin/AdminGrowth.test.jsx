import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";

import API from "../../services/api";
import AdminGrowth from "./AdminGrowth";
import { renderPage } from "../../test/renderPage";
import LandingPage from "../../pages/LandingPage";

let mock;
beforeEach(() => { localStorage.clear(); mock = new MockAdapter(API); });

const GROWTH = {
    days: 7, from: "2026-09-27", to: "2026-10-03",
    visitors: {
        visitors: 240, visits: 310, returning: 22,
        daily: [{ date: "2026-10-01", visitors: 90, visits: 120 }, { date: "2026-10-03", visitors: 150, visits: 190 }],
        sources: [{ source: "linkedin.com", visitors: 160 }, { source: "direct", visitors: 80 }],
        devices: [{ device: "mobile", visitors: 140 }, { device: "desktop", visitors: 100 }],
    },
    demo: {
        sessions: 96, visitors: 85, avgMinutes: 4.2, questions: 210, signupClicks: 19,
        daily: [{ date: "2026-10-03", sessions: 60 }],
        pages: [{ detail: "Dashboard", count: 96 }, { detail: "AI Copilot", count: 70 }],
        blocked: [{ detail: "POST /api/v1/transactions/expense", count: 12 },
                  { detail: "POST /api/v1/transactions/manual", count: 3 },
                  { detail: "POST /api/v1/transactions/upload", count: 9 }],
        topQuestions: [], recentQuestions: [{ at: "2026-10-03T10:15:00", detail: "Can I afford a car?" }],
    },
    funnel: { visitors: 240, triedDemo: 85, signedUp: 18, addedData: 9 },
};

describe("AdminGrowth", () => {
    it("shows the funnel, what demo visitors did, and their questions", async () => {
        mock.onGet("/admin/growth").reply(200, GROWTH);
        render(<AdminGrowth />);

        expect(await screen.findByText("Visited the landing page")).toBeInTheDocument();
        expect(screen.getByText("35% of the step before")).toBeInTheDocument();   // 85 of 240 tried the demo
        expect(screen.getByText("21% of the step before")).toBeInTheDocument();   // 18 of 85 signed up
        expect(screen.getByText("50% of the step before")).toBeInTheDocument();   // 9 of 18 added data

        // Writes the demo turned away, in words, with the same action merged
        expect(screen.getByText("Add a transaction")).toBeInTheDocument();
        expect(screen.getByText("15")).toBeInTheDocument();                         // 12 + 3
        expect(screen.getByText("Upload a statement")).toBeInTheDocument();

        expect(screen.getByText("linkedin.com")).toBeInTheDocument();
        expect(screen.getByText("Direct or unknown")).toBeInTheDocument();
        expect(screen.getByText("Phone")).toBeInTheDocument();
        expect(screen.getByText("Can I afford a car?")).toBeInTheDocument();
        expect(screen.getByText("4.2 min")).toBeInTheDocument();
    });

    it("asks for the range picked", async () => {
        mock.onGet("/admin/growth").reply(200, GROWTH);
        render(<AdminGrowth />);
        await screen.findByText("Visited the landing page");
        expect(mock.history.get[0].params).toEqual({ days: 30 });
    });
});

describe("Landing page visits", () => {
    beforeEach(() => localStorage.clear());

    it("counts a visit with the anonymous visitor id", async () => {
        const { apiMock } = renderPage(<LandingPage />);
        await screen.findByText(/Try a demo account/);
        const visit = apiMock.history.post.find(r => r.url === "/visits");
        expect(visit).toBeTruthy();
        expect(JSON.parse(visit.data).visitorId).toBe(localStorage.getItem("fintwin_visitor"));
    });

    it("doesn't count an admin looking at their own site", async () => {
        localStorage.setItem("token", "t");
        localStorage.setItem("user", JSON.stringify({ role: "ADMIN" }));
        const { apiMock } = renderPage(<LandingPage />);
        await screen.findAllByText(/Open Dashboard/);
        expect(apiMock.history.post.find(r => r.url === "/visits")).toBeUndefined();
    });
});
