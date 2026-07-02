import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import AnalyticsPage from "./AnalyticsPage";

describe("AnalyticsPage", () => {
  it("renders without crashing", () => {
    renderPage(<AnalyticsPage transactions={[]} recurringExpenses={[]} />, { authed: true });
    expect(screen.getByText("Analytics")).toBeInTheDocument();
  });
});
