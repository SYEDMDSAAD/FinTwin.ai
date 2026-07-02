import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import Dashboard from "./Dashboard";

describe("Dashboard", () => {
  beforeEach(() => sessionStorage.setItem("splashShown", "1"));

  it("renders the sidebar nav without crashing", async () => {
    renderPage(<Dashboard />, { route: "/dashboard", authed: true });
    // Sidebar starts collapsed — nav items show as icons with a title tooltip, not text.
    expect(await screen.findByTitle("Dashboard")).toBeInTheDocument();
  });
});
