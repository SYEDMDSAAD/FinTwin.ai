import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("../services/api", () => ({ default: api }));
import FillFromPdf from "./FillFromPdf";

const pdf = () => new File(["%PDF-1.4"], "policy.pdf", { type: "application/pdf" });

describe("FillFromPdf", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("fills the form with what the reader found", async () => {
    api.post.mockResolvedValue({ data: { fields: { provider: "Star Health", premium: 18240 } } });
    const onFields = vi.fn();
    render(<FillFromPdf kind="policy" onFields={onFields} />);
    fireEvent.change(screen.getByLabelText("Policy PDF"), { target: { files: [pdf()] } });

    await waitFor(() => expect(onFields).toHaveBeenCalledWith({ provider: "Star Health", premium: 18240 }));
    const body = api.post.mock.calls[0][1];
    expect(api.post.mock.calls[0][0]).toBe("/documents/extract");
    expect(body.get("kind")).toBe("policy");
    expect(screen.getByRole("status")).toHaveTextContent("Filled 2 fields from the PDF");
  });

  it("asks for the password of a locked PDF and retries with it", async () => {
    api.post
      .mockRejectedValueOnce({ response: { data: { code: "password_required" } } })
      .mockResolvedValueOnce({ data: { fields: { emi: 31250 } } });
    const onFields = vi.fn();
    render(<FillFromPdf kind="loan" onFields={onFields} />);
    fireEvent.change(screen.getByLabelText("Loan statement PDF"), { target: { files: [pdf()] } });

    fireEvent.change(await screen.findByLabelText("PDF password"), { target: { value: "secret1" } });
    fireEvent.click(screen.getByText("Open"));
    await waitFor(() => expect(onFields).toHaveBeenCalledWith({ emi: 31250 }));
    expect(api.post.mock.calls[1][1].get("password")).toBe("secret1");
  });

  it("says so when nothing could be read", async () => {
    api.post.mockResolvedValue({ data: { fields: {} } });
    const onFields = vi.fn();
    render(<FillFromPdf kind="policy" onFields={onFields} />);
    fireEvent.change(screen.getByLabelText("Policy PDF"), { target: { files: [pdf()] } });
    expect(await screen.findByRole("status")).toHaveTextContent("Couldn't find the details");
    expect(onFields).not.toHaveBeenCalled();
  });
});
