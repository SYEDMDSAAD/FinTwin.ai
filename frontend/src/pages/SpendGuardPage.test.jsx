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
    isPhone: vi.fn(() => true),          // a phone unless a test says it's a laptop
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
    format.isPhone.mockReturnValue(true);
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

        // Google Pay didn't open: the same link goes to a backup app instead
        fireEvent.click(screen.getByRole("button", { name: "PhonePe" }));
        expect(format.openUpi).toHaveBeenLastCalledWith(CAFE + "&am=450.00", "phonepe");
        fireEvent.click(screen.getByRole("button", { name: "Paytm" }));
        expect(format.openUpi).toHaveBeenLastCalledWith(CAFE + "&am=450.00", "paytm");
        fireEvent.click(screen.getByRole("button", { name: /open google pay again/i }));
        expect(format.openUpi).toHaveBeenLastCalledWith(CAFE + "&am=450.00");
        expect(posted("outcome")).toHaveLength(1);                         // switching apps records nothing new
    });

    it("says a paid payment was added to the transactions, and takes it back if it wasn't paid", async () => {
        mock.onPost("/guard/check").reply(200, {
            ...PAUSE, eventId: "e9", decision: "go", message: "", source: "fast_lane", reason: "small",
        });
        mock.onPost("/guard/outcome").reply(200, {
            choice: "paid", link: CAFE + "&am=450.00", toRebalance: 0, recordedTransactionId: 321, wallet: WALLET,
        });
        mock.onPost("/guard/unrecord").reply(200, { removed: true });
        const changed = vi.fn();
        render(<SpendGuardPage onFinTwinChanged={changed} />);
        await pasteAndCheck(CAFE, 450);
        fireEvent.click(await screen.findByRole("button", { name: /^pay/i }));

        expect(await screen.findByText(/Added to your transactions/)).toBeInTheDocument();
        expect(changed).toHaveBeenCalledTimes(1);               // the dashboard reloads its transactions
        fireEvent.click(screen.getByRole("button", { name: "I didn't pay" }));
        expect(await screen.findByText("Taken out of your transactions.")).toBeInTheDocument();
        expect(changed).toHaveBeenCalledTimes(2);
        expect(posted("unrecord")).toEqual([{ eventId: "e9" }]);
    });

    it("checks a typed UPI ID the same way as a scanned code", async () => {
        mock.onPost("/guard/check").reply(200, { ...PAUSE, eventId: "e7" });
        render(<SpendGuardPage />);
        fireEvent.change(await screen.findByLabelText("UPI ID"), { target: { value: "not-an-id" } });
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Enter a UPI ID like");

        fireEvent.change(screen.getByLabelText("UPI ID"), { target: { value: "ravi.kumar@okicici" } });
        fireEvent.change(screen.getByLabelText("Payee name"), { target: { value: "Ravi & Sons" } });
        fireEvent.click(screen.getByRole("button", { name: "Continue" }));
        expect(await screen.findByText("ravi.kumar@okicici")).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Amount in rupees"), { target: { value: "650" } });
        fireEvent.click(screen.getByRole("button", { name: /check before paying/i }));

        await waitFor(() => expect(posted("check")).toEqual([
            { qr: "upi://pay?pa=ravi.kumar@okicici&pn=Ravi%20%26%20Sons&cu=INR", amount: "650" }]));
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
        fireEvent.click(screen.getByRole("button", { name: /pay ₹450 in google pay/i }));
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

    it("asks what a payment to an unknown payee is for, then checks with the answer", async () => {
        const FRIEND = "upi://pay?pa=9876543210@ybl&pn=Ravi&cu=INR";
        mock.onPost("/guard/check").replyOnce(200, {
            decision: "ask_reason", question: "Spend Guard can't tell who this is or what it's for. What's this payment for?",
            purposes: ["Food", "Rent", "Paying someone back", "Something else"], source: "rules", reason: null,
            amount: "2000.00", rupees: 2000, category: "Other", payeeName: "Ravi", payeeUpi: "9876543210@ybl",
        }).onPost("/guard/check").replyOnce(200, {
            ...PAUSE, eventId: "e9", decision: "go", message: "", source: "fast_lane", reason: "essential",
            amount: "2000.00", rupees: 2000, category: "Rent", payeeName: "Ravi", payeeUpi: "9876543210@ybl", budget: null,
        });
        render(<SpendGuardPage />);
        await pasteAndCheck(FRIEND, 2000);
        expect(await screen.findByText(/what's this payment for\?/i)).toBeInTheDocument();
        const checkBtn = screen.getByRole("button", { name: /check before paying/i });
        expect(checkBtn).toBeDisabled();                                    // an answer is needed first
        fireEvent.click(screen.getByRole("radio", { name: "Rent" }));
        fireEvent.change(screen.getByLabelText(/in your own words/i), { target: { value: "  November rent  " } });
        fireEvent.click(checkBtn);
        expect(await screen.findByText("9876543210@ybl · Rent")).toBeInTheDocument();
        expect(posted("check")).toEqual([
            { qr: FRIEND, amount: "2000" },
            { qr: FRIEND, amount: "2000", purpose: "Rent", reason: "November rent" }]);
    });

    it("hands every payment to Google Pay, with the payee and amount unchanged", () => {
        const link = "upi://pay?pa=chaicorner@okicici&pn=Chai%20Corner&mc=5814&cu=INR&am=450.00";
        const query = link.slice(link.indexOf("?") + 1);
        expect(format.googlePayLink(link, "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/131"))
            .toBe(`intent://pay?${query}#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end`);
        expect(format.googlePayLink(link, "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"))
            .toBe(`gpay://upi/pay?${query}`);
        expect(format.googlePayLink(link, "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)", 5))
            .toBe(`gpay://upi/pay?${query}`);                                   // an iPad
        expect(format.googlePayLink(link, "Mozilla/5.0 (X11; Linux x86_64)")).toBe(link);
        expect(format.googlePayLink("upi://pay?pa=a@ok&tn=a#b", "Android")).toContain("tn=a%23b#Intent;");
        expect(format.googlePayLink("https://evil.example/pay?pa=a@ok", "Android")).toBeNull();
        expect(format.googlePayLink("intent://x#Intent;package=evil;end", "Android")).toBeNull();
    });

    it("on a laptop, shows the checked payment as a QR code to scan with the phone", async () => {
        format.isPhone.mockReturnValue(false);
        const link = CAFE + "&am=450.00";
        mock.onPost("/guard/check").reply(200, { ...PAUSE, decision: "go", message: "", source: "fast_lane", reason: "small" });
        mock.onPost("/guard/outcome").reply(200, { choice: "paid", link, toRebalance: 0, wallet: WALLET });
        render(<SpendGuardPage />);
        await pasteAndCheck(CAFE, 450);
        fireEvent.click(await screen.findByRole("button", { name: /pay ₹450 in google pay/i }));
        expect(await screen.findByText("Scan to pay with your phone")).toBeInTheDocument();
        const code = await screen.findByRole("img", { name: "QR code for this payment" });
        expect(screen.queryByRole("button", { name: "PhonePe" })).not.toBeInTheDocument();   // no app to open here

        // The drawn code scans as exactly the checked payment
        const side = Number(code.getAttribute("viewBox").split(" ")[2]), scale = 6, w = side * scale;
        const px = new Uint8ClampedArray(w * w * 4).fill(255);
        for (const [, x, y] of code.querySelector("path").getAttribute("d").matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
            for (let dy = 0; dy < scale; dy += 1) for (let dx = 0; dx < scale; dx += 1) {
                const i = (((Number(y) * scale + dy) * w) + Number(x) * scale + dx) * 4;
                px[i] = px[i + 1] = px[i + 2] = 0;
            }
        }
        const { default: jsQR } = await import("jsqr");
        expect(jsQR(px, w, w)?.data).toBe(link);
    });

    it("never opens anything on a computer, and draws codes only for UPI payment links", async () => {
        const real = await vi.importActual("../components/guard/format");
        expect(real.isPhone("Mozilla/5.0 (Linux; Android 14)")).toBe(true);
        expect(real.isPhone("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)")).toBe(true);
        expect(real.isPhone("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)", 5)).toBe(true);     // an iPad
        expect(real.isPhone("Mozilla/5.0 (X11; Linux x86_64)", 0)).toBe(false);
        const before = window.location.href;
        real.openUpi(CAFE);                                   // jsdom is a computer
        expect(window.location.href).toBe(before);
        const { default: PayQr } = await import("../components/guard/PayQr");
        const { container } = render(<PayQr link="https://evil.example/pay?pa=a@ok" />);
        await new Promise((r) => setTimeout(r, 50));
        expect(container.querySelector("svg")).toBeNull();
    });

    it("offers only PhonePe and Paytm as backups, with the payee and amount unchanged", () => {
        const link = "upi://pay?pa=chaicorner@okicici&pn=Chai%20Corner&cu=INR&am=450.00";
        const query = link.slice(link.indexOf("?") + 1);
        const android = "Mozilla/5.0 (Linux; Android 14)", iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)";
        expect(format.BACKUP_APPS.map((a) => a.name)).toEqual(["PhonePe", "Paytm"]);
        expect(format.upiAppLink(link, "phonepe", android)).toBe(`intent://pay?${query}#Intent;scheme=upi;package=com.phonepe.app;end`);
        expect(format.upiAppLink(link, "paytm", android)).toBe(`intent://pay?${query}#Intent;scheme=upi;package=net.one97.paytm;end`);
        expect(format.upiAppLink(link, "phonepe", iphone)).toBe(`phonepe://pay?${query}`);
        expect(format.upiAppLink(link, "paytm", iphone)).toBe(`paytmmp://pay?${query}`);
        expect(format.upiAppLink(link, "whatsapp", android)).toBeNull();          // only the three apps
        expect(format.upiAppLink(link, undefined, android)).toBe(format.googlePayLink(link, android));
    });

    it("asks what an unknown payment is for in mock mode too", async () => {
        resetMock();
        const friend = "upi://pay?pa=ravi@sample&pn=Ravi";
        expect((await mockGuard("check", { qr: friend, amount: 2000 })).decision).toBe("ask_reason");
        expect((await mockGuard("check", { qr: friend, amount: 2000, purpose: "Made up" })).decision).toBe("ask_reason");
        expect((await mockGuard("check", { qr: friend, amount: 60 })).reason).toBe("small");
        const r = await mockGuard("check", { qr: friend, amount: 2000, purpose: "Rent" });
        expect([r.decision, r.reason, r.category]).toEqual(["go", "essential", "Rent"]);
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
