import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import SpendingCoachPage from "./SpendingCoachPage";

describe("SpendingCoachPage", () => {
  it("renders without crashing", () => {
    renderPage(<SpendingCoachPage />, { authed: true });
    expect(screen.getByText("AI Spending Coach")).toBeInTheDocument();
  });
});
