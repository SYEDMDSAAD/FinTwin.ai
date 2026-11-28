import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SpendGuardTxTag from "./SpendGuardTxTag";
import ScanHistory from "./guard/ScanHistory";
import * as guardApi from "../services/guardApi";
import * as demoGuard from "../utils/demoGuard";

vi.mock("../services/guardApi", () => ({ guard: vi.fn(), guardError: (e) => e.message }));
vi.mock("../utils/demoGuard", () => ({ storedUserIsDemo: vi.fn(() => false) }));

const tx = (source) => ({ id: 1, merchant: "Chai Corner", amount: -450, source, externalId: "GUARD:abc123" });
const at = new Date().toISOString();

describe("Spend Guard payments in the transactions and the scan history", () => {
    beforeEach(() => { vi.clearAllMocks(); demoGuard.storedUserIsDemo.mockReturnValue(false); });

    it("labels a payment no statement has confirmed, and nothing else", () => {
        const { container, rerender } = render(<SpendGuardTxTag t={tx("STATEMENT")} />);
        expect(container).toBeEmptyDOMElement();
        rerender(<SpendGuardTxTag t={tx("SPEND_GUARD")} />);
        expect(screen.getByText("Spend Guard · not yet in a statement")).toBeInTheDocument();
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("asks about a payment the statement didn't show: I didn't pay removes it", async () => {
        guardApi.guard.mockResolvedValue({ choice: "not_paid" });
        const changed = vi.fn();
        render(<SpendGuardTxTag t={tx("SPEND_GUARD_UNMATCHED")} onChanged={changed} />);
        expect(screen.getByText("Spend Guard · not in your statement")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "I didn't pay" }));
        await waitFor(() => expect(changed).toHaveBeenCalled());
        expect(guardApi.guard).toHaveBeenCalledWith("undo-paid", { eventId: "abc123", why: "not_in_statement" });
    });

    it("in the demo, points to Spend Guard instead of offering buttons", () => {
        demoGuard.storedUserIsDemo.mockReturnValue(true);
        render(<SpendGuardTxTag t={tx("SPEND_GUARD_UNMATCHED")} />);
        expect(screen.getByText(/asks about this in its scan history/)).toBeInTheDocument();
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("scan history: keeps one the statement missed, and undoes a mistaken I paid", async () => {
        guardApi.guard.mockResolvedValue({ wallet: {} });
        render(<ScanHistory onWallet={() => {}} items={[
            { id: "a", type: "scan", at, amount: 2000, category: "People", payeeName: "Rohan", choice: "paid", notInStatement: true, canUndo: true },
            { id: "b", type: "scan", at, amount: 450, category: "Food", payeeName: "Chai Corner", choice: "paid", canUndo: true },
        ]} />);
        expect(screen.getByText("Not in your statement")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Yes, I paid" }));
        await waitFor(() => expect(guardApi.guard).toHaveBeenCalledWith("keep-paid", { eventId: "a" }));
        fireEvent.click(screen.getByRole("button", { name: /undo/i }));
        await waitFor(() => expect(guardApi.guard).toHaveBeenCalledWith("undo-paid", { eventId: "b", why: "user" }));
    });
});
