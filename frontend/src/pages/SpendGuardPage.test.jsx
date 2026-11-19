import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";

import API from "../services/api";
import { forgetGuardEnabled } from "../services/guardApi";
import { mockGuard, resetMock } from "../services/guardMock";
import Sidebar from "../components/Sidebar";
import SpendGuardPage from "./SpendGuardPage";
import * as format from "../components/guard/format";

vi.mock("../components/guard/format", async (importOriginal) => ({
    ...(await importOriginal()),
    openUpi: vi.fn(),
}));

const CAFE = "upi://pay?pa=chaicorner@okicici&pn=Chai%20Corner&mc=5814&cu=INR";

const WALLET = {
    demo: true, balances: { main: 30000, spending: 5000 }, buffer: 3500, weekly: 5000,
    weekStart: "2026-11-16", nextAllowance: "2026-11-23", daysToAllowance: 4, nextAllowanceCut: 0,
    savedByPausing: 0, adjustments: {}, plan: null,
    settings: { language: "English", minCheck: 100, maxPausesPerDay: 3, emergencyPerMonth: 2,
                emergencyMax: 1500, ownUpiId: "", ownName: "" },
    wishlist: [], recent: [], checkIns: [], ai: "ready", data: "persona",
};

const PAUSE = {
    eventId: "e1", decision: "pause", message: "It's late, and this takes your Food budget ₹200 over.",
    showWishlist: false, source: "ai", reason: null, amount: "450.00", rupees: 450, category: "Food",
    payeeName: "Chai Corner", payeeUpi: "chaicorner@okicici",
    budget: { limit: 6000, spent: 5750, left_after: -200, used_after_pct: 103, over_after: true },
    week: { left: 5000, left_after: 4550, days_to_allowance: 4, share_of_left_pct: 9 },
    goal: { name: "Goa trip", delay_days: 3 },
};

let mock;

function posted(action) {
    return mock.history.post.filter((r) => r.url === `/guard/${action}`).map((r) => JSON.parse(r.data));
}

async function pasteAndCheck(link, amount) {
    fireEvent.click(await screen.findByRole("button", { name: /paste a link/i }));
    fireEvent.change(screen.getByLabelText("UPI payment link"), { target: { value: link } });
    fireEvent.click(screen.getByRole("button", { name: "Use this link" }));
    if (amount != null) {
        fireEvent.change(await screen.findByLabelText("Amount in rupees"), { target: { value: String(amount) } });
    }
    fireEvent.click(screen.getByRole("button", { name: /check before paying/i }));
}

beforeEach(() => {
    mock = new MockAdapter(API);
    mock.onPost("/guard/wallet").reply(200, WALLET);
    format.openUpi.mockClear();
});

afterEach(() => {
    mock.restore();
    vi.useRealTimers();
    forgetGuardEnabled();
});

describe("SpendGuardPage", () => {
    it("says plainly when Spend Guard isn't open to this account", async () => {
        mock.onPost("/guard/wallet").reply(403, { error: "Spend Guard isn't open to your account yet." });
        render(<SpendGuardPage />);
        expect(await screen.findByRole("alert")).toHaveTextContent("Spend Guard isn't open to your account yet.");
        expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    });

    it("holds Pay anyway for five seconds, then hands the payment to the UPI app", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        mock.onPost("/guard/check").reply(200, PAUSE);
        mock.onPost("/guard/outcome").reply(200, {
            choice: "paid", link: CAFE + "&am=450.00", toRebalance: 200, needsUpiId: false,
            wallet: { ...WALLET, balances: { main: 30000, spending: 4550 } },
        });
        render(<SpendGuardPage />);
        await pasteAndCheck(CAFE, 450);

        expect(await screen.findByText(PAUSE.message)).toBeInTheDocument();
        expect(screen.getByText("Food budget ₹200 over")).toBeInTheDocument();
        expect(posted("check")).toEqual([{ qr: CAFE, amount: "450" }]);

        const payAnyway = screen.getByRole("button", { name: /pay anyway/i });
        expect(payAnyway).toBeDisabled();
        expect(screen.getByRole("button", { name: "Skip it" })).toBeEnabled();     // never trapped
        // Counts down to 1 and is still locked; a second later it unlocks
        for (let i = 0; i < 10 && payAnyway.textContent !== "Pay anyway (1)"; i++) {
            await act(async () => { vi.advanceTimersByTime(1000); });
        }
        expect(payAnyway).toHaveTextContent("Pay anyway (1)");
        expect(payAnyway).toBeDisabled();
        await act(async () => { vi.advanceTimersByTime(1000); });
        expect(payAnyway).toHaveTextContent(/^Pay anyway$/);
        expect(payAnyway).toBeEnabled();
        fireEvent.click(payAnyway);

        await waitFor(() => expect(format.openUpi).toHaveBeenCalledWith(CAFE + "&am=450.00"));
        expect(posted("outcome")).toEqual([{ eventId: "e1", choice: "paid" }]);
        expect(await screen.findByText("Keep this month on track")).toBeInTheDocument();
    });

    it("never opens a UPI app for a made-up sample shop", async () => {
        mock.onPost("/guard/check").reply(200, {
            ...PAUSE, eventId: "e2", decision: "go", message: "", source: "fast_lane", reason: "small",
            payeeUpi: "chaicorner@sample",
        });
        mock.onPost("/guard/outcome").reply(200, { choice: "paid", link: "upi://pay?pa=chaicorner@sample&am=450.00",
                                                   toRebalance: 0, wallet: WALLET });
        render(<SpendGuardPage />);
        fireEvent.click(await screen.findByRole("button", { name: "Café, ₹450" }));
        fireEvent.click(screen.getByRole("button", { name: /check before paying/i }));
        expect(await screen.findByText("Small payments never wait")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /pay ₹450 in your upi app/i }));
        expect(await screen.findByText("Sample code: nothing to pay")).toBeInTheDocument();
        expect(format.openUpi).not.toHaveBeenCalled();
    });

    it("sends a payment the account can't cover to a top-up for the shortfall", async () => {
        mock.onPost("/guard/check").reply(200, {
            ...PAUSE, eventId: "e3", decision: "insufficient", source: "rules", rupees: 6000, amount: "6000.00",
            message: "Your spending account has ₹5,000, so your bank would decline this ₹6,000 payment.",
            week: { left: 5000, left_after: -1000, days_to_allowance: 4, share_of_left_pct: 100 },
        });
        render(<SpendGuardPage />);
        await pasteAndCheck(CAFE, 6000);
        fireEvent.click(await screen.findByRole("button", { name: "Ask for a top-up" }));
        expect(await screen.findByLabelText("Top-up amount in rupees")).toHaveValue("1000");
        expect(screen.getByRole("tab", { name: /wallet/i })).toHaveAttribute("aria-selected", "true");
    });

    it("moves a smaller top-up, then balances the month once approved", async () => {
        mock.onPost("/guard/topup").reply(200, {
            eventId: "t1", decision: "approve_less", suggestedAmount: 1200, requested: 2000, buffer: 3500,
            message: "₹1,200 gets you to your allowance in 4 days.", source: "ai",
        });
        mock.onPost("/guard/outcome").reply(200, {
            choice: "paid", link: null, needsUpiId: true, toRebalance: 1200,
            wallet: { ...WALLET, balances: { main: 28800, spending: 6200 }, buffer: 2300 },
        });
        mock.onPost("/guard/rebalance").reply(200, {
            eventId: "t1", amount: 1200, source: "ai", message: "₹900 from Shopping and ₹300 from Entertainment.",
            cuts: [{ kind: "category", name: "Shopping", amount: 900 }, { kind: "category", name: "Entertainment", amount: 300 }],
        });
        mock.onPost("/guard/approve-cuts").reply(200, { wallet: WALLET });
        render(<SpendGuardPage />);
        fireEvent.click(await screen.findByRole("tab", { name: /wallet/i }));
        fireEvent.change(screen.getByLabelText("Top-up amount in rupees"), { target: { value: "2000" } });
        fireEvent.click(screen.getByRole("button", { name: "Ask for a top-up" }));

        expect(await screen.findByText("₹1,200 gets you to your allowance in 4 days.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Move ₹2,000 anyway" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Not now" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Move ₹1,200" }));
        expect(await screen.findByText("₹1,200 moved to your spending account")).toBeInTheDocument();
        expect(posted("outcome")).toEqual([{ eventId: "t1", choice: "paid", amount: 1200 }]);
        expect(screen.getByText("₹6,200")).toBeInTheDocument();                   // the hero updated
        // A second ask can't wipe this top-up's balancing card off the screen
        expect(screen.getByRole("button", { name: "Ask for a top-up" })).toBeDisabled();

        fireEvent.click(screen.getByRole("button", { name: "Suggest where it comes from" }));
        expect(await screen.findByText("-₹900")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Approve" }));
        expect(await screen.findByText("Balanced")).toBeInTheDocument();
        expect(posted("approve-cuts")).toEqual([{ eventId: "t1" }]);
    });

    it("always lets the user move the money anyway when told to wait", async () => {
        mock.onPost("/guard/topup").reply(200, {
            eventId: "t2", decision: "wait", suggestedAmount: null, requested: 1500, buffer: 3500,
            message: "It's late. Wait 10 minutes, then decide.", source: "ai",
        });
        render(<SpendGuardPage />);
        fireEvent.click(await screen.findByRole("tab", { name: /wallet/i }));
        fireEvent.change(screen.getByLabelText("Top-up amount in rupees"), { target: { value: "1500" } });
        fireEvent.click(screen.getByRole("button", { name: "Ask for a top-up" }));
        expect(await screen.findByRole("button", { name: "I'll wait" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Move ₹1,500 anyway" })).toBeInTheDocument();
    });

    it("lets the user turn down an approved top-up, then ask again", async () => {
        mock.onPost("/guard/topup").reply(200, {
            eventId: "t3", decision: "approve", suggestedAmount: null, requested: 800, buffer: 3500,
            message: "₹800 moves to your spending account, and your buffer keeps ₹2,700.", source: "ai",
        });
        mock.onPost("/guard/outcome").reply(200, { choice: "skipped", link: null, toRebalance: 0, wallet: WALLET });
        render(<SpendGuardPage />);
        fireEvent.click(await screen.findByRole("tab", { name: /wallet/i }));
        fireEvent.change(screen.getByLabelText("Top-up amount in rupees"), { target: { value: "800" } });
        fireEvent.click(screen.getByRole("button", { name: "Ask for a top-up" }));

        fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
        expect(await screen.findByText("Nothing moved")).toBeInTheDocument();
        expect(posted("outcome")).toEqual([{ eventId: "t3", choice: "skipped" }]);
        expect(screen.getByLabelText("Top-up amount in rupees")).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Ask for another top-up" }));
        expect(screen.getByLabelText("Top-up amount in rupees")).toBeEnabled();
        expect(screen.getByLabelText("Top-up amount in rupees")).toHaveValue("");
    });

    it("says why the buffer grew after a cut to next week's allowance", async () => {
        mock.onPost("/guard/wallet").reply(200, { ...WALLET, buffer: 4250, nextAllowanceCut: 750 });
        render(<SpendGuardPage />);
        fireEvent.click(await screen.findByRole("tab", { name: /wallet/i }));
        expect(screen.getByText(/next one in 4 days, ₹750 smaller \(kept in your buffer\)/)).toBeInTheDocument();
    });

    it("explains money carried over from last week, and keeps the meter's value in range", async () => {
        mock.onPost("/guard/wallet").reply(200, { ...WALLET, balances: { main: 32735, spending: 7265 }, weekly: 5265 });
        render(<SpendGuardPage />);
        fireEvent.click(await screen.findByRole("tab", { name: /wallet/i }));
        expect(screen.getByText(/weekly allowance ₹5,265, plus ₹2,000 carried over/i)).toBeInTheDocument();
        const meter = screen.getByRole("meter", { name: "Left to spend this week" });
        expect(meter).toHaveAttribute("aria-valuenow", "5265");
        expect(meter).toHaveAttribute("aria-valuetext", "₹7,265 left, of a ₹5,265 weekly allowance");
    });

    it("moves between tabs with the arrow keys, with one tab stop", async () => {
        render(<SpendGuardPage />);
        const scan = await screen.findByRole("tab", { name: /scan & pay/i });
        expect(scan).toHaveAttribute("tabindex", "0");
        expect(screen.getByRole("tab", { name: /wallet/i })).toHaveAttribute("tabindex", "-1");
        expect(scan).toHaveAttribute("aria-controls", "sg-panel-scan");
        expect(document.getElementById("sg-panel-scan")).toHaveAttribute("role", "tabpanel");

        fireEvent.keyDown(scan, { key: "ArrowRight" });
        const wallet = screen.getByRole("tab", { name: /wallet/i });
        expect(wallet).toHaveAttribute("aria-selected", "true");
        expect(wallet).toHaveFocus();
        fireEvent.keyDown(wallet, { key: "End" });
        expect(screen.getByRole("tab", { name: /payday/i })).toHaveFocus();
        fireEvent.keyDown(document.activeElement, { key: "ArrowRight" });                  // wraps round
        expect(scan).toHaveFocus();
        expect(scan).toHaveAttribute("aria-selected", "true");
    });

    it("shows the payday split and approves it", async () => {
        mock.onPost("/guard/payday").reply(200, {
            planId: "p1",
            plan: { id: "p1", salary: 45000, bills: 14500, buffer: 2500, weekly: [5250, 5250, 5250, 5250],
                    goals: [{ goal: "Goa trip", amount: 6000 }, { goal: "Emergency fund", amount: 1000 }],
                    message: "Rent and bills take ₹14,500, and ₹7,000 goes to your goals.", source: "ai" },
        });
        mock.onPost("/guard/approve-plan").reply(200, { wallet: { ...WALLET, buffer: 2500, weekly: 5250 } });
        render(<SpendGuardPage />);
        fireEvent.click(await screen.findByRole("tab", { name: /payday/i }));
        fireEvent.change(screen.getByLabelText("Salary in rupees"), { target: { value: "45000" } });
        fireEvent.click(screen.getByRole("button", { name: /plan my month/i }));

        const split = await screen.findByRole("img", { name: /salary ₹45,000/i });
        expect(split).toHaveAccessibleName(
            "Salary ₹45,000: Rent and bills ₹14,500, Savings goals ₹7,000, Spending, four weeks ₹21,000, Buffer for top-ups ₹2,500");
        expect(screen.getByText("Goa trip ₹6,000 · Emergency fund ₹1,000")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Approve this plan" }));
        expect(await screen.findByText(/approved: week 1 has moved/i)).toBeInTheDocument();
        expect(posted("approve-plan")).toEqual([{ planId: "p1" }]);
    });

    it("runs end to end in mock mode, with no backend", async () => {
        localStorage.setItem("fintwin_guard_mock", "1");
        resetMock();
        render(<SpendGuardPage />);
        expect(await screen.findByText(/mock mode: made-up data, and no ai/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Clothes, ₹2,400" }));
        fireEvent.click(screen.getByRole("button", { name: /check before paying/i }));
        expect(await screen.findByText(/takes your shopping budget ₹1,500 over/i, {}, { timeout: 3000 })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Wishlist for 2 days" }));
        expect(await screen.findByText("On your wishlist", {}, { timeout: 3000 })).toBeInTheDocument();
        expect(mock.history.post).toHaveLength(0);                                  // nothing left the browser
    });

    it("always pauses a bet in mock mode, however small", async () => {
        resetMock();
        const r = await mockGuard("check", { qr: "upi://pay?pa=quickbet@sample&pn=QuickBet&mc=7995", amount: 50 });
        expect(r.decision).toBe("pause");
        expect(r.message).toMatch(/^This ₹50 payment is to a betting merchant\. It would push .+ back about 1 day\.$/);
    });
});

describe("Spend Guard in the navigation", () => {
    function renderSidebar() {
        return render(<Sidebar activeSection="Dashboard" setActiveSection={() => {}} />);
    }

    it("stays hidden unless the backend lets this user in", async () => {
        localStorage.setItem("token", "t");
        mock.onGet("/guard/enabled").reply(200, { enabled: false });
        renderSidebar();
        await waitFor(() => expect(mock.history.get).toHaveLength(1));
        expect(screen.queryByTitle("Spend Guard")).not.toBeInTheDocument();
    });

    it("appears for a user who's allowed in", async () => {
        localStorage.setItem("token", "t");
        mock.onGet("/guard/enabled").reply(200, { enabled: true });
        const { container } = renderSidebar();
        expect(await within(container).findByTitle("Spend Guard")).toBeInTheDocument();
    });

    it("stays hidden for the demo account and when the check fails", async () => {
        localStorage.setItem("token", "t");
        mock.onGet("/guard/enabled").reply(403);
        renderSidebar();
        await waitFor(() => expect(mock.history.get).toHaveLength(1));
        expect(screen.queryByTitle("Spend Guard")).not.toBeInTheDocument();
    });
});
