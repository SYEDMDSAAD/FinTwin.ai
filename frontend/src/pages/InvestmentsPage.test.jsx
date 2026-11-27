import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import InvestmentsPage from "./InvestmentsPage";

describe("InvestmentsPage", () => {
  it("shows the portfolio by default", async () => {
    renderPage(<InvestmentsPage />, { authed: true });
    expect(await screen.findByRole("region", { name: "Portfolio value" })).toBeInTheDocument();
  });

  it("explores fund collections first, then the watchlist and US stocks", async () => {
    renderPage(<InvestmentsPage view="Explore" />, { authed: true });
    const watch = await screen.findByRole("tab", { name: "Fund watchlist" });
    expect(screen.getByRole("tab", { name: "Collections", selected: true })).toBeInTheDocument();
    fireEvent.click(watch);
    expect(screen.getByRole("tab", { name: "Fund watchlist", selected: true })).toBeInTheDocument();
  });

  it("sends Future Twin's SIP button to the SIPs page", async () => {
    const onNavigate = vi.fn();
    renderPage(<InvestmentsPage view="Future Twin" onNavigate={onNavigate} />, { authed: true });
    expect(await screen.findByText(/twin/i)).toBeInTheDocument();
  });
});
