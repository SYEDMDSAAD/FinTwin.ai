import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent, waitFor, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MockAdapter from "axios-mock-adapter";
import toast from "react-hot-toast";

import { renderPage } from "../test/renderPage";
import LandingPage from "../pages/LandingPage";
import DemoBanner from "../components/DemoBanner";
import { AuthProvider } from "../context/AuthContext";
import API from "../services/api";
import { installDemoToastGuard } from "./demoGuard";

describe("Try the demo", () => {
    beforeEach(() => localStorage.clear());

    it("signs a logged-out visitor into the demo with one click", async () => {
        const { apiMock } = renderPage(<LandingPage />);
        apiMock.reset();
        apiMock.onPost("/demo/start").reply(200, {
            accessToken: "demo-token", email: "demo@fintwin.invalid", fullName: "Riya Mehta", role: "DEMO",
        });

        fireEvent.click(screen.getByRole("button", { name: /Try FinTwin with a demo account/ }));

        await waitFor(() => expect(localStorage.getItem("token")).toBe("demo-token"));
        expect(JSON.parse(localStorage.getItem("user"))).toMatchObject({ role: "DEMO", fullName: "Riya Mehta" });
        expect(localStorage.getItem("refreshToken")).toBeNull();          // a demo just ends
        expect(localStorage.getItem("activeSection")).toBe("Dashboard");
        // The anonymous visitor id went with it, for counting distinct visitors
        const sent = JSON.parse(apiMock.history.post[0].data);
        expect(sent.visitorId).toBe(localStorage.getItem("fintwin_visitor"));
    });

    it("isn't offered to someone already signed in", () => {
        renderPage(<LandingPage />, { authed: true });
        expect(screen.queryByRole("button", { name: /Try FinTwin with a demo account/ })).not.toBeInTheDocument();
    });
});

describe("DemoBanner", () => {
    beforeEach(() => localStorage.clear());

    const renderBanner = () => render(
        <AuthProvider><MemoryRouter><DemoBanner section="Dashboard" /></MemoryRouter></AuthProvider>
    );

    it("shows in the demo, with the way to sign up, and reports the page", async () => {
        localStorage.setItem("token", "demo-token");
        localStorage.setItem("user", JSON.stringify({ role: "DEMO", fullName: "Riya Mehta" }));
        const mock = new MockAdapter(API);
        mock.onPost("/demo/event").reply(204);

        renderBanner();

        expect(screen.getByText("You're exploring a demo account")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Sign up and use your own data" })).toBeInTheDocument();
        await waitFor(() => expect(mock.history.post.length).toBe(1));
        expect(JSON.parse(mock.history.post[0].data)).toEqual({ kind: "page", detail: "Dashboard" });
    });

    it("isn't shown to real users", () => {
        localStorage.setItem("token", "t");
        localStorage.setItem("user", JSON.stringify({ role: "USER", fullName: "Asha" }));
        renderBanner();
        expect(screen.queryByText("You're exploring a demo account")).not.toBeInTheDocument();
    });
});

describe("A write the demo turns away", () => {
    beforeEach(() => localStorage.clear());

    it("shows one friendly message instead of the page's own error", async () => {
        installDemoToastGuard();
        const mock = new MockAdapter(API);
        mock.onPost("/budgets").reply(403, { code: "demo_read_only", error: "This is a demo account." });

        await expect(API.post("/budgets", {})).rejects.toBeTruthy();

        // The page's catch block would now call toast.error: held back
        expect(toast.error("Failed to save budget.")).toBeUndefined();
    });
});
