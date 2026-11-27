import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import InvestmentsPage from "./InvestmentsPage";

describe("InvestmentsPage", () => {
  it("renders without crashing", async () => {
    renderPage(<InvestmentsPage />, { authed: true });
    expect(await screen.findByRole("tab", { name: "My Portfolio" })).toBeInTheDocument();
  });
});

describe("InvestmentsPage tabs", () => {
  it("opens the tab another screen asked for", async () => {
    localStorage.setItem("investmentsTab", "Future Twin");
    renderPage(<InvestmentsPage />, { authed: true });
    expect(await screen.findByRole("tab", { name: "Future Twin", selected: true })).toBeInTheDocument();
    expect(localStorage.getItem("investmentsTab")).toBeNull();
  });
});
