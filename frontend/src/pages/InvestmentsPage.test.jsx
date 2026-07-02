import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import InvestmentsPage from "./InvestmentsPage";

describe("InvestmentsPage", () => {
  it("renders without crashing", async () => {
    renderPage(<InvestmentsPage />, { authed: true });
    expect(await screen.findByText("Investment Portfolio")).toBeInTheDocument();
  });
});
