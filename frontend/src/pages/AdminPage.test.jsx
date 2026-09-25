import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "../test/renderPage";
import AdminPage from "./AdminPage";

describe("AdminPage", () => {
  it("renders the admin sidebar without crashing", async () => {
    renderPage(<AdminPage />, { route: "/admin", authed: true, admin: true });
    expect(await screen.findByText("Support Tickets")).toBeInTheDocument();
  });

  it("links the Monitoring tab to Grafana when the backend names it", async () => {
    const { apiMock } = renderPage(<AdminPage />, { route: "/admin", authed: true, admin: true });
    apiMock.reset();
    apiMock.onGet("/admin/metrics/live").reply(200, { grafanaUrl: "https://fintwin.grafana.net/d/fintwin-ai-tokens" });
    apiMock.onAny().reply(200, []);
    const user = userEvent.setup();

    await user.click(await screen.findByText("Monitoring"));
    const link = await screen.findByRole("link", { name: /Grafana dashboards/ });
    expect(link).toHaveAttribute("href", "https://fintwin.grafana.net/d/fintwin-ai-tokens");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows no Grafana link when none is configured", async () => {
    const { apiMock } = renderPage(<AdminPage />, { route: "/admin", authed: true, admin: true });
    apiMock.reset();
    apiMock.onGet("/admin/metrics/live").reply(200, { grafanaUrl: null });
    apiMock.onAny().reply(200, []);
    const user = userEvent.setup();

    await user.click(await screen.findByText("Monitoring"));
    expect(await screen.findByText(/Auto-refresh ON/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Grafana dashboards/ })).not.toBeInTheDocument();
  });
});
