import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import LandingPage from "./LandingPage";

describe("LandingPage", () => {
  beforeEach(() => localStorage.clear());

  it("renders the hero heading without crashing", () => {
    renderPage(<LandingPage />);
    expect(document.getElementById("hero-heading")).toBeInTheDocument();
  });

  it("follows the app's theme and switches it from the navbar", () => {
    localStorage.setItem("fintwin-theme", "light");
    const { container } = renderPage(<LandingPage />);
    const land = container.querySelector(".land");
    expect(land).toHaveClass("light");
    expect(container.querySelector("style").textContent).toContain("#f6f7fb");

    fireEvent.click(screen.getAllByRole("button", { name: "Switch to dark mode" })[0]);

    expect(land).not.toHaveClass("light");
    expect(container.querySelector("style").textContent).toContain("#060810");
    expect(localStorage.getItem("fintwin-theme")).toBe("dark");          // the dashboard follows
    expect(screen.getAllByRole("button", { name: "Switch to light mode" }).length).toBeGreaterThan(0);
  });

  it("gives the website real legal links and the product picture", () => {
    renderPage(<LandingPage />);
    expect(document.querySelector(".land")).toHaveClass("web");
    expect(screen.getByRole("link", { name: "Privacy policy" })).toHaveAttribute("href", "/privacy-policy");
    expect(screen.getByRole("link", { name: "Terms of service" })).toHaveAttribute("href", "/terms");
    expect(screen.queryByText("Careers")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /FinTwin dashboard with Spend Guard/ })).toBeInTheDocument();
  });
});
