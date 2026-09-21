import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";
import API from "../services/api";
import EmailAlertsSetup, { GMAIL_FILTER } from "./EmailAlertsSetup";

const READY = {
  enabled: true,
  address: "u-0123456789abcdef0123@in.fintwin.app",
  confirmationCode: null,
  recent: [],
};

describe("EmailAlertsSetup", () => {
  let mock;
  beforeEach(() => {
    mock = new MockAdapter(API);
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue() } });
  });
  afterEach(() => { mock.restore(); vi.useRealTimers(); });

  it("shows the forwarding address and copies it", async () => {
    mock.onGet("/email-alerts").reply(200, READY);
    render(<EmailAlertsSetup />);

    expect(await screen.findByText(READY.address)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Copy address"));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(READY.address));
  });

  it("offers a Gmail filter that only forwards bank mail", async () => {
    mock.onGet("/email-alerts").reply(200, READY);
    render(<EmailAlertsSetup />);

    expect(await screen.findByText(GMAIL_FILTER)).toBeInTheDocument();
    expect(GMAIL_FILTER).toMatch(/^from:\(/);
    expect(GMAIL_FILTER).toContain("bank.in");
  });

  it("shows Gmail's confirmation code once it has arrived", async () => {
    mock.onGet("/email-alerts").reply(200, { ...READY, confirmationCode: "612345678" });
    render(<EmailAlertsSetup />);

    expect(await screen.findByText("612345678")).toBeInTheDocument();
    expect(screen.queryByText(/Waiting for Gmail's code/)).not.toBeInTheDocument();
  });

  it("checks again for the code while waiting", async () => {
    mock.onGet("/email-alerts").replyOnce(200, READY);
    mock.onGet("/email-alerts").replyOnce(200, { ...READY, confirmationCode: "998877665" });
    render(<EmailAlertsSetup />);

    fireEvent.click(await screen.findByText("Check now"));
    expect(await screen.findByText("998877665")).toBeInTheDocument();
  });

  it("lists what recent alerts turned into", async () => {
    mock.onGet("/email-alerts").reply(200, {
      ...READY,
      recent: [
        { receivedAt: "2026-09-21T11:02:00", account: "HDFC ··1234", status: "IMPORTED" },
        { receivedAt: "2026-09-20T09:00:00", bank: "HDFC", status: "UNMATCHED", detail: "No transaction found in this email" },
        { receivedAt: "2026-09-19T09:00:00", bank: null, status: "REJECTED" },
      ],
    });
    render(<EmailAlertsSetup />);

    expect(await screen.findByText("Added")).toBeInTheDocument();
    expect(screen.getByText("Couldn't read")).toHaveAttribute("title", "No transaction found in this email");
    expect(screen.getByText("Not verified")).toBeInTheDocument();
  });

  it("asks before replacing the address, then shows the new one", async () => {
    mock.onGet("/email-alerts").reply(200, READY);
    mock.onPost("/email-alerts/rotate").reply(200, { ...READY, address: "u-ffffffffffffffffffff@in.fintwin.app" });
    render(<EmailAlertsSetup />);

    fireEvent.click(await screen.findByText(/Get a new address/));
    expect(mock.history.post).toHaveLength(0);
    fireEvent.click(screen.getByText("Yes, new address"));

    expect(await screen.findByText("u-ffffffffffffffffffff@in.fintwin.app")).toBeInTheDocument();
  });

  it("says plainly when the server hasn't switched the feature on", async () => {
    mock.onGet("/email-alerts").reply(200, { enabled: false });
    render(<EmailAlertsSetup />);
    expect(await screen.findByText(/isn't switched on for this FinTwin server/)).toBeInTheDocument();
  });
});
