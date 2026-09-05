import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";

import API from "../services/api";
import DailyRecap, { dayLabel, groupByDay } from "./DailyRecap";

const TODAY = new Date(2026, 8, 5); // Sat 5 Sep 2026

const RECAP = {
  headline: "You spent ₹1,540 since Thursday.",
  periodLabel: "since Thursday",
  lines: [
    "Most of it — ₹1,200 — went on food.",
    "Coming up: ₹649 to Netflix in 3 days.",
  ],
  totalSpent: 1540,
  chargeCount: 2,
  firstVisit: false,
  charges: [
    { merchant: "SWIGGY", amount: 1200, category: "Food", date: "2026-09-04", source: "CARD" },
    { merchant: "UBER", amount: 340, category: "Transport", date: "2026-09-03", source: "BANK" },
  ],
  upcoming: [
    { merchant: "NETFLIX", amount: 649, dueDate: "2026-09-08", cadence: "Monthly" },
  ],
};

let mock;

beforeEach(() => {
  mock = new MockAdapter(API);
});

afterEach(() => {
  mock.restore();
  vi.useRealTimers();
});

describe("dayLabel", () => {
  it("names recent days rather than dating them", () => {
    expect(dayLabel("2026-09-05", TODAY)).toBe("Today");
    expect(dayLabel("2026-09-04", TODAY)).toBe("Yesterday");
    expect(dayLabel("2026-09-02", TODAY)).toBe("Wednesday");
  });

  it("falls back to a date once the weekday stops being useful", () => {
    expect(dayLabel("2026-08-20", TODAY)).toBe("20 Aug");
  });

  it("handles a missing or unparseable date", () => {
    expect(dayLabel(null, TODAY)).toBe("");
    expect(dayLabel("nonsense", TODAY)).toBe("");
  });
});

describe("groupByDay", () => {
  it("keeps charges in order under one heading per day", () => {
    const groups = groupByDay([
      { date: "2026-09-05", merchant: "A" },
      { date: "2026-09-05", merchant: "B" },
      { date: "2026-09-04", merchant: "C" },
    ], TODAY);

    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe("Today");
    expect(groups[0].charges).toHaveLength(2);
    expect(groups[1].label).toBe("Yesterday");
  });

  it("returns nothing for an empty day", () => {
    expect(groupByDay([], TODAY)).toEqual([]);
  });
});

describe("DailyRecap", () => {
  it("leads with the headline and its supporting sentences", async () => {
    mock.onGet("/daily-recap").reply(200, RECAP);
    mock.onPost("/daily-recap/seen").reply(204);

    render(<DailyRecap />);

    expect(await screen.findByText("You spent ₹1,540 since Thursday.")).toBeInTheDocument();
    expect(screen.getByText("Most of it — ₹1,200 — went on food.")).toBeInTheDocument();
    expect(screen.getByText("SINCE YOU LAST LOOKED")).toBeInTheDocument();
  });

  it("shows what is landing this week and the charges behind the headline", async () => {
    mock.onGet("/daily-recap").reply(200, RECAP);
    mock.onPost("/daily-recap/seen").reply(204);

    render(<DailyRecap />);

    expect(await screen.findByText("LANDING THIS WEEK")).toBeInTheDocument();
    expect(screen.getByText("NETFLIX")).toBeInTheDocument();
    expect(screen.getByText("SWIGGY")).toBeInTheDocument();
    // The rail is named, which is how a user sees their card is connected
    expect(screen.getByText(/Food · Card/)).toBeInTheDocument();
  });

  it("marks the recap seen only after it has rendered", async () => {
    mock.onGet("/daily-recap").reply(200, RECAP);
    mock.onPost("/daily-recap/seen").reply(204);

    render(<DailyRecap />);
    await screen.findByText(RECAP.headline);

    await waitFor(() => {
      expect(mock.history.post.filter((r) => r.url === "/daily-recap/seen")).toHaveLength(1);
    });
  });

  it("greets a first-time user differently", async () => {
    mock.onGet("/daily-recap").reply(200, { ...RECAP, firstVisit: true });
    mock.onPost("/daily-recap/seen").reply(204);

    render(<DailyRecap />);

    expect(await screen.findByText("YOUR FIRST LOOK")).toBeInTheDocument();
  });

  it("says nothing happened rather than rendering an empty page", async () => {
    mock.onGet("/daily-recap").reply(200, {
      ...RECAP,
      headline: "Nothing new since yesterday.",
      lines: ["No new charges have come in since you last checked."],
      totalSpent: 0,
      chargeCount: 0,
      charges: [],
      upcoming: [],
    });
    mock.onPost("/daily-recap/seen").reply(204);

    render(<DailyRecap />);

    expect(await screen.findByText("Nothing new since yesterday.")).toBeInTheDocument();
    expect(screen.getByText(/accounts are connected and quiet/)).toBeInTheDocument();
  });

  it("surfaces a load failure without claiming the user spent nothing", async () => {
    mock.onGet("/daily-recap").reply(500);

    render(<DailyRecap />);

    expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText(/quiet/)).not.toBeInTheDocument();
  });

  it("does not mark the recap seen when it failed to load", async () => {
    mock.onGet("/daily-recap").reply(500);

    render(<DailyRecap />);
    await screen.findByText(/could not be loaded/);

    expect(mock.history.post).toHaveLength(0);
  });
});
