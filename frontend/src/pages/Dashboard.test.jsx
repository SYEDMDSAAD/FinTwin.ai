import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import Dashboard from "./Dashboard";

describe("Dashboard", () => {
  beforeEach(() => sessionStorage.setItem("splashShown", "1"));

  it("renders the sidebar nav without crashing", async () => {
    renderPage(<Dashboard />, { route: "/dashboard", authed: true });
    // The four tabs, with Home open by default
    const nav = await screen.findAllByRole("navigation", { name: "Main" });
    expect(nav.length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Home" })[0]).toHaveAttribute("aria-current", "page");
  });
});
