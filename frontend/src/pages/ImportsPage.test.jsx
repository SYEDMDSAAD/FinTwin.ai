import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import ImportsPage from "./ImportsPage";

describe("ImportsPage", () => {
  it("renders without crashing", () => {
    renderPage(<ImportsPage onImported={vi.fn()} />, { authed: true });
    expect(screen.getByText("Import Transactions")).toBeInTheDocument();
    expect(screen.getByText("Upload File")).toBeInTheDocument();
  });
});
