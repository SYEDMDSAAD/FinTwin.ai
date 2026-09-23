import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockAdapter from "axios-mock-adapter";

import API from "../services/api";
import HelpWidget from "./HelpWidget";

vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
import toast from "react-hot-toast";

let mock;

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mock = new MockAdapter(API);
});

async function openMessages() {
  const user = userEvent.setup();
  render(<HelpWidget />);
  await user.click(screen.getByRole("button"));           // the floating launcher
  await user.click(screen.getByText("Send us a message"));
  return user;
}

describe("HelpWidget", () => {
  it("submits a real ticket instead of only claiming to", async () => {
    // The widget used to toast "Message sent!" and send nothing at all.
    localStorage.setItem("user", JSON.stringify({ email: "beta@fintwin.ai", fullName: "Beta User" }));
    mock.onPost("/tickets").reply(200, { ticketId: 7 });

    const user = await openMessages();
    await user.type(screen.getByPlaceholderText(/describe your issue/i), "Import failed on a PhonePe PDF");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    expect(mock.history.post).toHaveLength(1);
    expect(JSON.parse(mock.history.post[0].data)).toMatchObject({
      email: "beta@fintwin.ai",
      message: "Import failed on a PhonePe PDF",
    });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("beta@fintwin.ai"));
  });

  it("reports a failed send rather than pretending it worked", async () => {
    localStorage.setItem("user", JSON.stringify({ email: "beta@fintwin.ai" }));
    mock.onPost("/tickets").reply(500);

    const user = await openMessages();
    await user.type(screen.getByPlaceholderText(/describe your issue/i), "Anything");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("answers help questions in place, with no dead article links", async () => {
    const user = userEvent.setup();
    render(<HelpWidget />);
    await user.click(screen.getByRole("button"));

    await user.click(screen.getByText(/wrong category/i));
    expect(await screen.findByText(/FinTwin learns the payee/i)).toBeInTheDocument();
  });

  it("does not promise bank linking that is still in testing", async () => {
    const user = userEvent.setup();
    render(<HelpWidget />);
    await user.click(screen.getByRole("button"));

    await user.click(screen.getByText(/connect my bank account/i));
    expect(await screen.findByText(/still in testing/i)).toBeInTheDocument();
  });
});
