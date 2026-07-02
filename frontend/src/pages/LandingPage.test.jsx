import { describe, it, expect } from "vitest";
import { renderPage } from "../test/renderPage";
import LandingPage from "./LandingPage";

describe("LandingPage", () => {
  it("renders the hero heading without crashing", () => {
    renderPage(<LandingPage />);
    expect(document.getElementById("hero-heading")).toBeInTheDocument();
  });
});
