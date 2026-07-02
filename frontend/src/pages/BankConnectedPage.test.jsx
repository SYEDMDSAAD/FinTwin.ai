import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import BankConnectedPage from "./BankConnectedPage";

describe("BankConnectedPage", () => {
  it("renders the success state without crashing", () => {
    renderPage(<BankConnectedPage />, { route: "/bank-connected?status=OK" });
    expect(screen.getByText("Bank Connected!")).toBeInTheDocument();
  });

  it("renders the failure state for a rejected consent", () => {
    renderPage(<BankConnectedPage />, { route: "/bank-connected?status=REJECTED" });
    expect(screen.getByText("Consent Not Approved")).toBeInTheDocument();
  });
});
