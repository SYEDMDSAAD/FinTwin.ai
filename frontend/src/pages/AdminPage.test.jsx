import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import AdminPage from "./AdminPage";

describe("AdminPage", () => {
  it("renders the admin sidebar without crashing", async () => {
    renderPage(<AdminPage />, { route: "/admin", authed: true, admin: true });
    expect(await screen.findByText("Support Tickets")).toBeInTheDocument();
  });
});
