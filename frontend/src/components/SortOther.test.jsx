import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";
import API from "../services/api";
import SortOther from "./SortOther";

const GROUPS = [
  { payee: "OTT commerce solutions", count: 2, total: 998, sampleId: 11, merchant: "Paid to OTT commerce solutions" },
  { payee: "SARA ENTERPRISES", count: 2, total: 320, sampleId: 12, merchant: "Paid to SARA ENTERPRISES" },
];

function openPanel() {
  fireEvent.click(screen.getByRole("button", { expanded: false }));
}

describe("SortOther", () => {
  let mock;
  beforeEach(() => { mock = new MockAdapter(API); });
  afterEach(() => { mock.restore(); });

  it("starts collapsed, showing only the summary", async () => {
    mock.onPost("/transactions/recategorize").reply(200, { updated: 0 });
    mock.onGet("/transactions/unsorted-payees").reply(200, GROUPS);
    render(<SortOther />);

    expect(await screen.findByText(/₹1,318 in 4 payments is still "Other"/)).toBeInTheDocument();
    expect(screen.getByRole("button", { expanded: false })).toHaveTextContent("Sort 2 payees");
    expect(screen.queryByText("SARA ENTERPRISES")).not.toBeInTheDocument();

    openPanel();
    expect(screen.getByText("SARA ENTERPRISES")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { expanded: true }));
    expect(screen.queryByText("SARA ENTERPRISES")).not.toBeInTheDocument();
  });

  it("re-sorts old rows first and asks for a quiet refresh when any changed", async () => {
    mock.onPost("/transactions/recategorize").reply(200, { updated: 240, remaining: 4 });
    mock.onGet("/transactions/unsorted-payees").reply(200, GROUPS);
    const onBulkChanged = vi.fn();
    render(<SortOther onBulkChanged={onBulkChanged} />);

    await screen.findByText(/still "Other"/);
    expect(onBulkChanged).toHaveBeenCalledTimes(1);
  });

  it("sorting a payee updates the page in place — no reload", async () => {
    mock.onPost("/transactions/recategorize").reply(200, { updated: 0 });
    mock.onGet("/transactions/unsorted-payees").reply(200, GROUPS);
    mock.onPatch("/transactions/12/category").reply(200, {});
    const onSorted = vi.fn();
    const onBulkChanged = vi.fn();
    render(<SortOther onSorted={onSorted} onBulkChanged={onBulkChanged} />);
    await screen.findByText(/still "Other"/);
    openPanel();

    fireEvent.change(screen.getByLabelText("Category for SARA ENTERPRISES"), { target: { value: "Shopping" } });

    await waitFor(() => expect(onSorted).toHaveBeenCalledWith({
      id: 12, category: "Shopping", applyToSimilar: true, merchant: "Paid to SARA ENTERPRISES",
    }));
    expect(onBulkChanged).not.toHaveBeenCalled();
    expect(mock.history.get).toHaveLength(1);        // the list wasn't refetched
    expect(screen.queryByText("SARA ENTERPRISES")).not.toBeInTheDocument();
    expect(screen.getByText("OTT commerce solutions")).toBeInTheDocument();   // panel stays open
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ category: "Shopping", applyToSimilar: true, remember: true });
  });

  it("offers People and never Other as a choice", async () => {
    mock.onPost("/transactions/recategorize").reply(200, { updated: 0 });
    mock.onGet("/transactions/unsorted-payees").reply(200, GROUPS.slice(0, 1));
    render(<SortOther />);
    await screen.findByText(/still "Other"/);
    openPanel();

    const options = [...screen.getByLabelText("Category for OTT commerce solutions").querySelectorAll("option")].map(o => o.value);
    expect(options).toContain("People");
    expect(options).not.toContain("Other");
  });

  it("disappears when nothing is left in Other", async () => {
    mock.onPost("/transactions/recategorize").reply(200, { updated: 3 });
    mock.onGet("/transactions/unsorted-payees").reply(200, []);
    const { container } = render(<SortOther onBulkChanged={vi.fn()} />);
    await waitFor(() => expect(mock.history.get).toHaveLength(1));
    expect(container).toBeEmptyDOMElement();
  });
});
