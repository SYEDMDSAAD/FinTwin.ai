import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";
import API from "../services/api";
import DataCoverage, { describeCoverage } from "./DataCoverage";

describe("describeCoverage", () => {
  it("says an alerting account is live and until when", () => {
    expect(describeCoverage({ status: "LIVE", lastAlert: "2026-09-20" }))
      .toEqual({ tone: "live", text: "Live · alerts up to 20 Sept" });
  });

  it("says a bank-linked account is live without a date", () => {
    expect(describeCoverage({ status: "LIVE", lastAlert: null }).text).toBe("Live · linked bank");
  });

  it("gives the statement date for a current account", () => {
    expect(describeCoverage({ status: "CURRENT", statementsUpTo: "2026-08-31" }).text)
      .toBe("Statements up to 31 Aug");
  });

  it("names the missing month, or counts several", () => {
    expect(describeCoverage({ status: "BEHIND", missingMonths: ["August"] }).text)
      .toBe("August statement missing");
    expect(describeCoverage({ status: "BEHIND", missingMonths: ["July", "August"] }).text)
      .toBe("2 months missing, latest August");
  });

  it("falls back to the last activity when there are no statements", () => {
    expect(describeCoverage({ status: "BEHIND", missingMonths: [], lastTransaction: "2026-08-01" }).text)
      .toBe("Nothing since 1 Aug");
  });
});

describe("DataCoverage", () => {
  let mock;
  beforeEach(() => { mock = new MockAdapter(API); });
  afterEach(() => { mock.restore(); });

  it("lists each account with its status", async () => {
    mock.onGet("/data-coverage").reply(200, [
      { account: "ICICI ··345", card: false, status: "BEHIND", missingMonths: ["August"] },
      { account: "HDFC ··5678", card: true, status: "LIVE", lastAlert: "2026-09-18" },
    ]);
    render(<DataCoverage />);

    expect(await screen.findByText("ICICI ··345")).toBeInTheDocument();
    expect(screen.getByText(/August statement missing/)).toBeInTheDocument();
    expect(screen.getByText(/Live · alerts up to/)).toBeInTheDocument();
  });

  it("explains what will appear when there are no accounts yet", async () => {
    mock.onGet("/data-coverage").reply(200, []);
    render(<DataCoverage />);
    expect(await screen.findByText(/No accounts yet/)).toBeInTheDocument();
  });

  it("stays out of the way when coverage can't load", async () => {
    mock.onGet("/data-coverage").reply(500);
    const { container } = render(<DataCoverage />);
    await new Promise(r => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });
});
