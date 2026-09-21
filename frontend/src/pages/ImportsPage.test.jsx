import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";
import { renderPage } from "../test/renderPage";
import API from "../services/api";
import ImportsPage from "./ImportsPage";

describe("ImportsPage", () => {
  it("renders without crashing", () => {
    renderPage(<ImportsPage onImported={vi.fn()} />, { authed: true });
    expect(screen.getByText("Import Transactions")).toBeInTheDocument();
    expect(screen.getByText("Upload File")).toBeInTheDocument();
  });
});

// A statement as net banking exports it: preamble, CRLF, Indian amounts.
const STATEMENT = [
  "Account Number :,XXXXXXX1234",
  "Txn Date,Description,Debit,Credit,Balance",
  '01/09/2026,UPI/SWIGGY,"1,250.00",,"24,550.00"',
  '02/09/2026,NEFT CR ACME PAYROLL,,"1,20,000.00","1,44,550.00"',
].join("\r\n");

describe("ImportsPage — statement import", () => {
  let mock;
  beforeEach(() => { mock = new MockAdapter(API); });
  afterEach(() => { mock.restore(); });

  async function uploadAndPreview({ card = false } = {}) {
    const { container } = render(<ImportsPage onImported={vi.fn()} />);
    const input = container.querySelector("#csv-upload");
    fireEvent.change(input, {
      target: { files: [new File([STATEMENT], "sept.csv", { type: "text/csv" })] },
    });

    // Columns are guessed, so preview is available without touching a select
    await screen.findByText(/skipped 1 header lines/);
    if (card) fireEvent.click(screen.getByText("Credit card"));
    fireEvent.click(screen.getByText(/Preview →/));
    await screen.findByText(/2 transactions from 2026-09-01 to 2026-09-02/);
  }

  it("guesses the columns and reads Indian amounts correctly", async () => {
    await uploadAndPreview();
    // ₹1,250 used to come through as ₹1 (parseFloat stops at the comma)
    expect(screen.getByText(/₹1,250 out/)).toBeInTheDocument();
    expect(screen.getByText(/₹1,20,000 in/)).toBeInTheDocument();
    expect(screen.getAllByText("Auto")).toHaveLength(2);
  });

  it("posts normalised rows without a placeholder category", async () => {
    mock.onPost("/transactions/batch").reply(200, { imported: 2, duplicates: 0, skipped: 0 });
    await uploadAndPreview();

    fireEvent.click(screen.getByText("Import 2 Transactions"));
    await screen.findByText("Import Complete!");

    const req = mock.history.post[0];
    expect(req.params).toEqual({ accountType: "BANK" });
    expect(JSON.parse(req.data)).toEqual([
      { date: "2026-09-01", merchant: "UPI/SWIGGY", amount: -1250, balance: 24550 },
      { date: "2026-09-02", merchant: "NEFT CR ACME PAYROLL", amount: 120000, balance: 144550 },
    ]);
  });

  it("marks card statements and reports rows that were already imported", async () => {
    mock.onPost("/transactions/batch").reply(200, { imported: 1, duplicates: 1, skipped: 0 });
    await uploadAndPreview({ card: true });

    fireEvent.click(screen.getByText("Import 2 Transactions"));
    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(mock.history.post[0].params).toEqual({ accountType: "CARD" });
    expect(await screen.findByText(/1 already imported earlier, skipped/)).toBeInTheDocument();
  });
});
