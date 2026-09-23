import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockAdapter from "axios-mock-adapter";

import { render } from "@testing-library/react";
import API from "../services/api";
import WeeklyReport from "./WeeklyReport";

const REPORT = {
  summary: "Your score of 72/100 rests on savings of ₹38000 a month.",
  financialScore: 72,
  netWorth: 850000,
  spendingHealth: "Moderate",
  monthlyLeakage: 4200,
  savingsRate: 38,
  predictedSavings: 36000,
  degraded: false,
  comparisonPeriod: "May vs April 2026",
  insights: [{ title: "Food dominates outflow", detail: "Food & Dining is ₹18000.", severity: "medium" }],
  risks: [{ title: "Leakage compounds", detail: "Monthly leakage of ₹4200.", severity: "high" }],
  recommendations: [{ title: "Automate the leak", detail: "Redirect ₹4200 into a SIP.", severity: "high" }],
  trends: [
    { label: "Expenses", current: 62000, previous: 58000, changePercent: 6.9, direction: "up", goodDirection: "down" },
    { label: "Savings", current: 38000, previous: 40000, changePercent: -5, direction: "down", goodDirection: "up" },
  ],
};

let mock;

beforeEach(() => {
  localStorage.clear();
  mock = new MockAdapter(API);
});

async function generate() {
  const user = userEvent.setup();
  render(<WeeklyReport />);
  await user.click(screen.getByRole("button", { name: /generate report/i }));
  return user;
}

describe("WeeklyReport", () => {
  it("shows the landing state before a report exists", () => {
    render(<WeeklyReport />);
    expect(screen.getByRole("button", { name: /generate report/i })).toBeInTheDocument();
  });

  it("renders structured findings with severity badges", async () => {
    mock.onGet("/reports/weekly").reply(200, REPORT);
    await generate();

    expect(await screen.findByText("Leakage compounds")).toBeInTheDocument();
    expect(screen.getByText("Automate the leak")).toBeInTheDocument();
    expect(screen.getByText("Food dominates outflow")).toBeInTheDocument();
    expect(screen.getAllByText("high").length).toBeGreaterThan(0);
  });

  it("surfaces a failure instead of rendering an empty report", async () => {
    // Previously this left the page showing "undefined/100".
    mock.onGet("/reports/weekly").reply(500);
    await generate();

    expect(await screen.findByText(/could not generate your report/i)).toBeInTheDocument();
    expect(screen.queryByText("/ 100")).not.toBeInTheDocument();
  });

  it("says so when the report fell back to computed prose", async () => {
    mock.onGet("/reports/weekly").reply(200, { ...REPORT, degraded: true });
    await generate();

    expect(await screen.findByText(/ai analysis was unavailable/i)).toBeInTheDocument();
  });

  it("does not show the degraded notice for a healthy report", async () => {
    mock.onGet("/reports/weekly").reply(200, REPORT);
    await generate();

    await screen.findByText("Leakage compounds");
    expect(screen.queryByText(/ai analysis was unavailable/i)).not.toBeInTheDocument();
  });

  it("renders month-over-month movement with the comparison period", async () => {
    mock.onGet("/reports/weekly").reply(200, REPORT);
    await generate();

    expect(await screen.findByText("MONTH OVER MONTH")).toBeInTheDocument();
    expect(screen.getAllByText("May vs April 2026").length).toBeGreaterThan(0);
    expect(screen.getByText("+6.9%")).toBeInTheDocument();
    expect(screen.getByText("-5%")).toBeInTheDocument();
  });

  it("reads a report cached in the older prose-string shape", async () => {
    // Reports cached before findings became structured stored one string.
    localStorage.setItem(
      "fintwin_weekly_report",
      JSON.stringify({
        report: { ...REPORT, insights: "A single prose insight.", risks: "", recommendations: "" },
        savedAt: new Date().toISOString(),
      })
    );

    render(<WeeklyReport />);
    expect(await screen.findByText("A single prose insight.")).toBeInTheDocument();
    expect(screen.getByText(/no material risks detected/i)).toBeInTheDocument();
  });

  it("keeps the existing report visible while regenerating", async () => {
    mock.onGet("/reports/weekly").reply(200, REPORT);
    const user = await generate();
    await screen.findByText("Leakage compounds");

    let resolve;
    mock.onGet("/reports/weekly").reply(() => new Promise((r) => { resolve = r; }));
    await user.click(screen.getByRole("button", { name: /regenerate/i }));

    // The old report stays on screen rather than blanking to a spinner page.
    expect(screen.getByText("Leakage compounds")).toBeInTheDocument();
    resolve([200, REPORT]);
    await waitFor(() => expect(screen.getByRole("button", { name: /regenerate/i })).toBeEnabled());
  });
});
