import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";
import API from "../services/api";
import SortOther from "./SortOther";

const GROUPS = [
  { payee: "OTT commerce solutions", count: 2, total: 998, sampleId: 11 },
  { payee: "SARA ENTERPRISES", count: 2, total: 320, sampleId: 12 },
];

describe("SortOther", () => {
  let mock;
  beforeEach(() => { mock = new MockAdapter(API); });
  afterEach(() => { mock.restore(); });

  it("re-sorts old rows first, then lists what's left by payee", async () => {
    mock.onPost("/transactions/recategorize").reply(200, { updated: 240, remaining: 4 });
    mock.onGet("/transactions/unsorted-payees").reply(200, GROUPS);
    const onChanged = vi.fn();
    render(<SortOther onChanged={onChanged} />);

    expect(await screen.findByText(/₹1,318 in 4 payments is still "Other"/)).toBeInTheDocument();
    expect(screen.getByText("OTT commerce solutions")).toBeInTheDocument();
    // the table refreshes because 240 rows just changed
    expect(onChanged).toHaveBeenCalled();
    expect(mock.history.post[0].url).toBe("/transactions/recategorize");
  });

  it("one choice sorts every payment to that payee and remembers it", async () => {
    mock.onPost("/transactions/recategorize").reply(200, { updated: 0, remaining: 4 });
    mock.onGet("/transactions/unsorted-payees").reply(200, GROUPS);
    mock.onPatch("/transactions/12/category").reply(200, {});
    render(<SortOther onChanged={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText("Category for SARA ENTERPRISES"), { target: { value: "Shopping" } });

    await waitFor(() => expect(screen.queryByText("SARA ENTERPRISES")).not.toBeInTheDocument());
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ category: "Shopping", applyToSimilar: true, remember: true });
  });

  it("offers People and never Other as a choice", async () => {
    mock.onPost("/transactions/recategorize").reply(200, { updated: 0 });
    mock.onGet("/transactions/unsorted-payees").reply(200, GROUPS.slice(0, 1));
    render(<SortOther />);

    const select = await screen.findByLabelText("Category for OTT commerce solutions");
    const options = [...select.querySelectorAll("option")].map(o => o.value);
    expect(options).toContain("People");
    expect(options).not.toContain("Other");
  });

  it("disappears when nothing is left in Other", async () => {
    mock.onPost("/transactions/recategorize").reply(200, { updated: 3 });
    mock.onGet("/transactions/unsorted-payees").reply(200, []);
    const { container } = render(<SortOther onChanged={vi.fn()} />);
    await waitFor(() => expect(mock.history.get).toHaveLength(1));
    expect(container).toBeEmptyDOMElement();
  });
});
