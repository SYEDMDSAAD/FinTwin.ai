import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EnhancedTransactionsTable from "./EnhancedTransactionsTable";

// One a day, newest first — so "SHOP 400" really is older than the first chunk
const txns = (n) => Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    merchant: `Paid to SHOP ${i}`,
    category: "Food",
    date: new Date(Date.UTC(2026, 8, 22) - i * 86400000).toISOString().slice(0, 10),
    amount: -(100 + i),
}));

describe("EnhancedTransactionsTable", () => {
    it("asks the page for a different range", () => {
        const onMonthsChange = vi.fn();
        render(<EnhancedTransactionsTable transactions={txns(3)} months={3} onMonthsChange={onMonthsChange} />);

        const select = screen.getByLabelText("How far back to show");
        expect(select).toHaveValue("3");
        fireEvent.change(select, { target: { value: "0" } });
        expect(onMonthsChange).toHaveBeenCalledWith(0);
    });

    it("renders a long history in chunks so the page stays usable", () => {
        // chunkSize is the real 300 in the app; 5 here keeps the test quick
        render(<EnhancedTransactionsTable transactions={txns(12)} months={0} onMonthsChange={() => {}} chunkSize={5} />);

        expect(screen.getByText("Showing 5 of 12")).toBeInTheDocument();
        expect(screen.queryAllByText("Paid to SHOP 7")).toHaveLength(0);

        fireEvent.click(screen.getByRole("button", { name: /show more \(7 older\)/i }));

        expect(screen.getByText("Showing 10 of 12")).toBeInTheDocument();
        expect(screen.getAllByText("Paid to SHOP 7").length).toBeGreaterThan(0);   // desktop row + mobile card

        fireEvent.click(screen.getByRole("button", { name: /show more \(2 older\)/i }));
        expect(screen.getByText("Showing 12 of 12")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /show more/i })).not.toBeInTheDocument();
    });

    it("has no range selector when the page doesn't offer one", () => {
        render(<EnhancedTransactionsTable transactions={txns(2)} />);
        expect(screen.queryByLabelText("How far back to show")).not.toBeInTheDocument();
    });
});
