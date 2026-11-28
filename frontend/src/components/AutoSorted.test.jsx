import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../services/api", () => ({ default: api }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
import AutoSorted from "./AutoSorted";

const groups = [
  { payee: "QZX VRLM LLP", count: 2, total: 800, sampleId: 1, merchant: "UPI/DR/1/QZX VRLM LLP", category: "Groceries" },
  { payee: "HJK DFG LLP", count: 1, total: 300, sampleId: 2, merchant: "UPI/DR/2/HJK DFG LLP", category: "Shopping" },
];

describe("AutoSorted", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("shows nothing when the agent sorted nothing", async () => {
    api.get.mockResolvedValue({ data: [] });
    const { container } = render(<AutoSorted />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("lists what was sorted and confirms it all", async () => {
    api.get.mockResolvedValue({ data: groups });
    api.post.mockResolvedValue({ data: { confirmed: 3 } });
    render(<AutoSorted />);
    fireEvent.click(await screen.findByText("FinTwin sorted 3 payments"));
    expect(screen.getByLabelText("Category for QZX VRLM LLP")).toHaveValue("Groceries");

    fireEvent.click(screen.getByText("These are right"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/transactions/auto-sorted/confirm",
      { merchants: ["UPI/DR/1/QZX VRLM LLP", "UPI/DR/2/HJK DFG LLP"] }));
    await waitFor(() => expect(screen.queryByText("FinTwin sorted 3 payments")).toBeNull());
  });

  it("corrects one payee and refreshes the page", async () => {
    api.get.mockResolvedValue({ data: groups });
    api.post.mockResolvedValue({ data: { corrected: 1 } });
    const onChanged = vi.fn();
    render(<AutoSorted onChanged={onChanged} />);
    fireEvent.click(await screen.findByText("FinTwin sorted 3 payments"));

    fireEvent.change(screen.getByLabelText("Category for HJK DFG LLP"), { target: { value: "Health" } });
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/transactions/auto-sorted/correct",
      { merchant: "UPI/DR/2/HJK DFG LLP", category: "Health" }));
    expect(onChanged).toHaveBeenCalled();
    expect(screen.queryByText("HJK DFG LLP")).toBeNull();
  });
});
