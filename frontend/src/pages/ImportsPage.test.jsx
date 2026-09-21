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
      target: { files: [new File([STATEMENT], "HDFC_Sept.csv", { type: "text/csv" })] },
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
    // the account label is guessed from the file name and the statement header
    expect(req.params).toEqual({ accountType: "BANK", account: "HDFC ··1234" });
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
    expect(mock.history.post[0].params).toEqual({ accountType: "CARD", account: "HDFC ··1234" });
    expect(await screen.findByText(/1 already imported earlier, skipped/)).toBeInTheDocument();
  });
});

// What the server's statement reader returns for a PDF or Excel file
const GRID = [
  ["HDFC BANK LTD", "", "", "", ""],
  ["Date", "Narration", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"],
  ["01/09/26", "UPI-SWIGGY-SWIGGY8@YBL", "1,250.00", "", "24,550.00"],
  ["02/09/26", "NEFT CR-ACME PAYROLL", "", "1,20,000.00", "1,44,550.00"],
];

describe("ImportsPage — accounts and alert emails", () => {
  let mock;
  beforeEach(() => { mock = new MockAdapter(API); });
  afterEach(() => { mock.restore(); });

  async function preview() {
    const utils = render(<ImportsPage onImported={vi.fn()} />);
    fireEvent.change(utils.container.querySelector("#csv-upload"), {
      target: { files: [new File([STATEMENT], "HDFC_Sept.csv", { type: "text/csv" })] },
    });
    await screen.findByText(/skipped 1 header lines/);
    return utils;
  }

  it("lets the user rename the account before importing", async () => {
    mock.onPost("/transactions/batch").reply(200, { imported: 2 });
    await preview();

    const field = screen.getByLabelText("ACCOUNT");
    expect(field).toHaveValue("HDFC ··1234");
    fireEvent.change(field, { target: { value: "HDFC Salary ··1234" } });
    fireEvent.click(screen.getByText(/Preview →/));
    fireEvent.click(await screen.findByText("Import 2 Transactions"));

    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(mock.history.post[0].params.account).toBe("HDFC Salary ··1234");
  });

  it("says when statement rows confirmed transactions already added from alert emails", async () => {
    mock.onPost("/transactions/batch").reply(200, { imported: 1, duplicates: 0, skipped: 0, reconciled: 1 });
    await preview();
    fireEvent.click(screen.getByText(/Preview →/));
    fireEvent.click(await screen.findByText("Import 2 Transactions"));

    expect(await screen.findByText(/1 already added from alert emails/)).toBeInTheDocument();
  });

  it("refreshes the coverage panel after an import", async () => {
    mock.onGet("/data-coverage").reply(200, []);
    mock.onPost("/transactions/batch").reply(200, { imported: 2 });
    await preview();
    await waitFor(() => expect(mock.history.get.filter(r => r.url === "/data-coverage")).toHaveLength(1));

    fireEvent.click(screen.getByText(/Preview →/));
    fireEvent.click(await screen.findByText("Import 2 Transactions"));

    await waitFor(() => expect(mock.history.get.filter(r => r.url === "/data-coverage")).toHaveLength(2));
  });
});

describe("ImportsPage — PDF and Excel statements", () => {
  let mock;
  beforeEach(() => { mock = new MockAdapter(API); });
  afterEach(() => { mock.restore(); });

  const choose = (container, name) => fireEvent.change(container.querySelector("#csv-upload"), {
    target: { files: [new File(["%PDF-1.7"], name, { type: "application/pdf" })] },
  });

  it("sends a PDF to the server reader and maps the grid it returns", async () => {
    mock.onPost("/transactions/statement/extract").reply(200, { grid: GRID, format: "pdf", pages: 1 });
    const { container } = render(<ImportsPage onImported={vi.fn()} />);

    choose(container, "HDFC_Sept.pdf");

    await screen.findByText(/skipped 1 header lines/);
    const form = mock.history.post[0].data;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("file").name).toBe("HDFC_Sept.pdf");
    expect(form.has("password")).toBe(false);

    fireEvent.click(screen.getByText(/Preview →/));
    expect(await screen.findByText(/₹1,250 out · ₹1,20,000 in/)).toBeInTheDocument();
  });

  it("asks for the password of a protected PDF, then opens it", async () => {
    mock.onPost("/transactions/statement/extract").replyOnce(422, {
      error: "This PDF is password-protected.", code: "password_required",
    });
    mock.onPost("/transactions/statement/extract").replyOnce(422, {
      error: "That password didn't open the PDF. Try again.", code: "password_incorrect",
    });
    mock.onPost("/transactions/statement/extract").replyOnce(200, { grid: GRID, format: "pdf", pages: 1 });
    const { container } = render(<ImportsPage onImported={vi.fn()} />);

    choose(container, "locked.pdf");
    const field = await screen.findByLabelText(/locked.pdf is password-protected/);

    fireEvent.change(field, { target: { value: "wrong" } });
    fireEvent.click(screen.getByText("Open"));
    expect(await screen.findByRole("alert")).toHaveTextContent("didn't open the PDF");

    fireEvent.change(field, { target: { value: "SAAD0109" } });
    fireEvent.click(screen.getByText("Open"));
    await screen.findByText(/skipped 1 header lines/);

    expect(mock.history.post[2].data.get("password")).toBe("SAAD0109");
    // the password does not linger once the file is open
    expect(screen.queryByLabelText(/password-protected/)).not.toBeInTheDocument();
  });

  it("stays on the upload step when the server can't read the file", async () => {
    mock.onPost("/transactions/statement/extract").reply(422, {
      error: "This PDF is a scanned image with no text in it.", code: "scanned_pdf",
    });
    const { container } = render(<ImportsPage onImported={vi.fn()} />);

    choose(container, "scan.pdf");

    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(screen.getByText("STEP 1 — UPLOAD STATEMENT")).toBeInTheDocument();
    expect(screen.queryByLabelText(/password-protected/)).not.toBeInTheDocument();
  });
});

describe("ImportsPage — UPI app statements", () => {
  let mock;
  beforeEach(() => { mock = new MockAdapter(API); });
  afterEach(() => { mock.restore(); });

  it("warns that a UPI app statement overlaps the bank statement", async () => {
    const csv = "Date,Transaction Details,Type,Amount\nJun 24, 2026,Paid to Apple Services,Debit,INR 39.00\n";
    const { container } = render(<ImportsPage onImported={vi.fn()} />);
    fireEvent.change(container.querySelector("#csv-upload"), {
      target: { files: [new File([csv.replace("Jun 24, 2026", '"Jun 24, 2026"')], "PhonePe_Transaction_Statement.csv", { type: "text/csv" })] },
    });

    expect(await screen.findByRole("note")).toHaveTextContent(/counted twice/);
    expect(screen.getByLabelText("ACCOUNT")).toHaveValue("PhonePe");
  });

  it("shows no such warning for a bank statement", async () => {
    const { container } = render(<ImportsPage onImported={vi.fn()} />);
    fireEvent.change(container.querySelector("#csv-upload"), {
      target: { files: [new File([STATEMENT], "HDFC_Sept.csv", { type: "text/csv" })] },
    });
    await screen.findByText(/skipped 1 header lines/);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});

