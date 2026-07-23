import { describe, it, expect } from "vitest";
import { monthlyEquivalent, rollForward } from "./SIPTracker";

describe("monthlyEquivalent", () => {
  it("returns the amount as-is for a monthly SIP", () => {
    expect(monthlyEquivalent({ amount: "5000", frequency: "Monthly" })).toBe(5000);
  });

  it("divides a quarterly SIP into its monthly commitment", () => {
    expect(monthlyEquivalent({ amount: "30000", frequency: "Quarterly" })).toBe(10000);
  });

  it("treats a missing frequency as monthly", () => {
    expect(monthlyEquivalent({ amount: "1200" })).toBe(1200);
  });

  it("handles a blank amount", () => {
    expect(monthlyEquivalent({ amount: "", frequency: "Monthly" })).toBe(0);
  });
});

describe("rollForward", () => {
  const now = new Date(2026, 6, 23); // 23 Jul 2026, local

  it("leaves a future date untouched", () => {
    const sip = { frequency: "Monthly", nextDebitDate: "2026-08-05" };
    expect(rollForward(sip, now).nextDebitDate).toBe("2026-08-05");
  });

  it("advances a past monthly date to the next occurrence", () => {
    const sip = { frequency: "Monthly", nextDebitDate: "2026-01-05" };
    expect(rollForward(sip, now).nextDebitDate).toBe("2026-08-05");
  });

  it("advances a past quarterly date in 3-month steps", () => {
    const sip = { frequency: "Quarterly", nextDebitDate: "2026-01-10" };
    expect(rollForward(sip, now).nextDebitDate).toBe("2026-10-10");
  });

  it("keeps today's date as the next debit", () => {
    const sip = { frequency: "Monthly", nextDebitDate: "2026-07-23" };
    expect(rollForward(sip, now).nextDebitDate).toBe("2026-07-23");
  });

  it("terminates and keeps the intended day for a month-end SIP", () => {
    // Regression: mutating the running date clamped to Feb 28 and then
    // looped forever without ever reaching the present.
    const sip = { frequency: "Monthly", nextDebitDate: "2026-01-31" };
    expect(rollForward(sip, now).nextDebitDate).toBe("2026-07-31");
  });

  it("clamps to the last day when the target month is shorter", () => {
    const sip = { frequency: "Monthly", nextDebitDate: "2026-01-31" };
    const feb = new Date(2026, 1, 15); // 15 Feb 2026
    expect(rollForward(sip, feb).nextDebitDate).toBe("2026-02-28");
  });

  it("does not shift the day in timezones behind UTC", () => {
    // "2026-03-10" parsed as UTC would read as 9 Mar locally.
    const sip = { frequency: "Monthly", nextDebitDate: "2026-03-10" };
    expect(rollForward(sip, now).nextDebitDate).toBe("2026-08-10");
  });

  it("leaves a SIP with no debit date alone", () => {
    const sip = { frequency: "Monthly", nextDebitDate: "" };
    expect(rollForward(sip, now).nextDebitDate).toBe("");
  });

  it("leaves an unparseable date alone", () => {
    const sip = { frequency: "Monthly", nextDebitDate: "not-a-date" };
    expect(rollForward(sip, now).nextDebitDate).toBe("not-a-date");
  });
});
