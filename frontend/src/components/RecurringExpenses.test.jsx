import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

import RecurringExpenses, { describeNextCharge } from "./RecurringExpenses";

const TODAY = new Date(2026, 8, 5); // 5 Sep 2026, local

afterEach(() => {
  vi.useRealTimers();
});

function freezeToday() {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
}

describe("describeNextCharge", () => {
  it("counts down in days while there is still time to cancel", () => {
    freezeToday();
    expect(describeNextCharge("2026-09-08")).toBe("in 3 days");
    expect(describeNextCharge("2026-09-06")).toBe("tomorrow");
  });

  it("falls back to a date once the charge is far enough out", () => {
    freezeToday();
    expect(describeNextCharge("2026-10-14")).toBe("14 Oct");
  });

  it("treats a past or present date as due now", () => {
    freezeToday();
    expect(describeNextCharge("2026-09-05")).toBe("due now");
    expect(describeNextCharge("2026-08-30")).toBe("due now");
  });

  it("handles a missing or unparseable date", () => {
    expect(describeNextCharge(null)).toBeNull();
    expect(describeNextCharge("not-a-date")).toBeNull();
  });
});

describe("RecurringExpenses", () => {
  const NETFLIX = {
    merchant: "NETFLIX*IN 4417",
    amount: 649,
    occurrences: 4,
    cadence: "Monthly",
    annualisedCost: 7896,
    nextChargeDate: "2026-09-12",
    amountVaries: false,
    active: true,
  };

  it("leads with the yearly cost of everything still active", () => {
    freezeToday();
    render(<RecurringExpenses recurringExpenses={[
      NETFLIX,
      { ...NETFLIX, merchant: "SPOTIFY", annualisedCost: 2388 },
    ]} />);

    expect(screen.getByText("₹10,284")).toBeInTheDocument();
    expect(screen.getByText(/a year across 2 charges/)).toBeInTheDocument();
  });

  it("shows cadence and next charge for an active subscription", () => {
    freezeToday();
    render(<RecurringExpenses recurringExpenses={[NETFLIX]} />);

    expect(screen.getByText("MONTHLY")).toBeInTheDocument();
    expect(screen.getByText("in 7 days")).toBeInTheDocument();
    expect(screen.getByText("₹7,896 a year")).toBeInTheDocument();
  });

  it("marks a variable bill as approximate rather than exact", () => {
    freezeToday();
    render(<RecurringExpenses recurringExpenses={[
      { ...NETFLIX, merchant: "ELECTRICITY", amountVaries: true },
    ]} />);

    expect(screen.getByText("approx")).toBeInTheDocument();
  });

  it("sets a lapsed charge aside and keeps it out of the yearly total", () => {
    freezeToday();
    render(<RecurringExpenses recurringExpenses={[
      NETFLIX,
      { ...NETFLIX, merchant: "OLD APP", annualisedCost: 3588, active: false },
    ]} />);

    expect(screen.getByText(/possibly cancelled/)).toBeInTheDocument();
    // Only Netflix counts toward the headline
    expect(screen.getByText("₹7,896")).toBeInTheDocument();
    expect(screen.getByText(/a year across 1 charge$/)).toBeInTheDocument();
  });

  it("says so plainly when nothing recurring was found", () => {
    render(<RecurringExpenses recurringExpenses={[]} />);
    expect(screen.getByText(/No recurring expenses detected/)).toBeInTheDocument();
  });
});
