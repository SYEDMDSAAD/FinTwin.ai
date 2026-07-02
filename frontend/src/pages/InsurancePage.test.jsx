import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import InsurancePage from "./InsurancePage";

describe("InsurancePage", () => {
  it("renders without crashing", async () => {
    renderPage(<InsurancePage />, { authed: true });
    expect(await screen.findByText("Insurance")).toBeInTheDocument();
  });
});
