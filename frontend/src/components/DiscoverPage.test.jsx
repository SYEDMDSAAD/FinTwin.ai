import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";
import API from "../services/api";
import DiscoverPage from "./DiscoverPage";

const IPOS = [
  { id: 1, name: "Open Co", status: "OPEN", category: "Mainboard", priceBandLow: 95, priceBandHigh: 100,
    lotSize: 150, minInvestment: 15000, openDate: "2026-09-21", closeDate: "2026-09-24" },
  { id: 2, name: "Listed Co", status: "LISTED", category: "SME", symbol: "LISTCO", issuePrice: 100,
    lotSize: 148, minInvestment: 14800, listingDate: "2026-09-08", currentPrice: 131.5, gainPct: 31.5 },
];

describe("DiscoverPage", () => {
  let mock;
  beforeEach(() => {
    mock = new MockAdapter(API);
    mock.onGet("/watchlist").reply(200, []);
  });
  afterEach(() => { mock.restore(); vi.useRealTimers(); });

  it("groups IPOs and shows a listed one's gain against its issue price", async () => {
    mock.onGet("/discover/ipos").reply(200, IPOS);
    render(<DiscoverPage />);

    const open = await screen.findByRole("region", { name: "Open now" });
    expect(within(open).getByText("Open Co")).toBeInTheDocument();
    expect(within(open).getByText("₹15,000")).toBeInTheDocument();          // min investment

    const listed = screen.getByRole("region", { name: "Recently listed" });
    expect(within(listed).getByText("+31.50% vs issue")).toBeInTheDocument();
    expect(within(listed).getByText("₹131.50")).toBeInTheDocument();
  });

  it("tracking an IPO application saves an IPO holding with its catalog link", async () => {
    mock.onGet("/discover/ipos").reply(200, IPOS);
    mock.onPost("/portfolio").reply(200, {});
    render(<DiscoverPage />);

    const open = await screen.findByRole("region", { name: "Open now" });
    fireEvent.click(within(open).getByText("Track my application"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByText("Save to portfolio"));

    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(JSON.parse(mock.history.post[0].data)).toMatchObject({
      name: "Open Co", type: "IPO", investedAmount: 15000, ipoStatus: "APPLIED", ipoListingId: 1,
    });
  });

  it("says so when there are no IPOs", async () => {
    mock.onGet("/discover/ipos").reply(200, []);
    render(<DiscoverPage />);
    expect(await screen.findByText(/No IPOs are listed here right now/)).toBeInTheDocument();
  });

  it("searches funds, shows NAV, and reveals past returns on demand", async () => {
    mock.onGet("/discover/ipos").reply(200, []);
    mock.onGet("/discover/funds").reply(200, [
      { code: "122640", name: "Parag Parikh Flexi Cap Fund - Direct Plan - Growth", amc: "PPFAS Mutual Fund",
        category: "Equity Scheme - Flexi Cap Fund", nav: 90.5324, nav_date: "21-Sep-2026" },
    ]);
    mock.onGet("/discover/funds/122640").reply(200, { code: "122640", returns: { "1y": -5.12, "3y": 12.05, "5y": 11.28 } });
    render(<DiscoverPage />);

    fireEvent.click(screen.getByRole("tab", { name: /Mutual funds/ }));
    fireEvent.change(screen.getByLabelText("Search mutual funds"), { target: { value: "parag" } });

    expect(await screen.findByText("₹90.53")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Parag Parikh Flexi Cap Fund/));
    expect(await screen.findByText("+12.05%")).toBeInTheDocument();
    expect(screen.getByText("-5.12%")).toBeInTheDocument();
  });

  it("a fund whose returns can't load still shows its NAV", async () => {
    mock.onGet("/discover/ipos").reply(200, []);
    mock.onGet("/discover/funds").reply(200, [{ code: "1", name: "Some Fund", amc: "X", category: "Y", nav: 10, nav_date: "d" }]);
    mock.onGet("/discover/funds/1").reply(200, { code: "1", returns: {} });
    render(<DiscoverPage />);

    fireEvent.click(screen.getByRole("tab", { name: /Mutual funds/ }));
    fireEvent.change(screen.getByLabelText("Search mutual funds"), { target: { value: "some" } });
    fireEvent.click(await screen.findByText("Some Fund"));
    expect(await screen.findByText(/Past returns are unavailable right now/)).toBeInTheDocument();
  });

  it("shows the stock watchlist with live prices and follows new stocks", async () => {
    mock.onGet("/discover/ipos").reply(200, []);
    mock.onGet("/watchlist").reply(200, [{ id: 7, kind: "STOCK", symbol: "HDFCBANK.NS", name: "HDFC Bank" }]);
    mock.onGet("/discover/stocks/quotes").reply(200, [{ symbol: "HDFCBANK.NS", price: 741.55, previousClose: 739.5, changePct: 0.28 }]);
    mock.onGet("/discover/stocks").reply(200, [{ symbol: "TMCV.NS", name: "Tata Motors Limited", exchange: "NSE" }]);
    mock.onPost("/watchlist").reply(200, {});
    render(<DiscoverPage />);

    fireEvent.click(screen.getByRole("tab", { name: /Stocks/ }));
    expect(await screen.findByText("₹741.55")).toBeInTheDocument();
    expect(screen.getByText("+0.28% today")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search stocks"), { target: { value: "tata" } });
    fireEvent.click(await screen.findByText("Follow"));
    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ kind: "STOCK", symbol: "TMCV.NS", name: "Tata Motors Limited" });
  });

  it("frames everything as information, not advice", async () => {
    mock.onGet("/discover/ipos").reply(200, []);
    render(<DiscoverPage />);
    expect(screen.getByText(/Information, not advice/)).toBeInTheDocument();
  });
});
