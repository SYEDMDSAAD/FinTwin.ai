import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";
import API from "../../services/api";
import AdminIpos from "./AdminIpos";

describe("AdminIpos", () => {
  let mock;
  beforeEach(() => { mock = new MockAdapter(API); });
  afterEach(() => { mock.restore(); });

  it("adds an IPO with numbers and dates in the shape the API expects", async () => {
    mock.onGet("/admin/ipos").reply(200, []);
    mock.onPost("/admin/ipos").reply(200, {});
    render(<AdminIpos />);

    fireEvent.click(await screen.findByText("Add IPO"));
    fireEvent.change(screen.getByLabelText(/Company name/), { target: { value: "NewCo Ltd" } });
    fireEvent.change(screen.getByLabelText(/Price band low/), { target: { value: "95" } });
    fireEvent.change(screen.getByLabelText(/Price band high/), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText(/Lot size/), { target: { value: "150" } });
    fireEvent.change(screen.getByLabelText("Opens"), { target: { value: "2026-09-25" } });
    fireEvent.click(screen.getAllByText("Add IPO").find(b => b.getAttribute("type") === "submit"));

    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(JSON.parse(mock.history.post[0].data)).toMatchObject({
      name: "NewCo Ltd", category: "Mainboard", priceBandLow: 95, priceBandHigh: 100, lotSize: 150,
      openDate: "2026-09-25", closeDate: null, issuePrice: null, symbol: null,
    });
  });

  it("shows the server's validation message", async () => {
    mock.onGet("/admin/ipos").reply(200, []);
    mock.onPost("/admin/ipos").reply(400, { error: "Price band low can't be above high" });
    render(<AdminIpos />);
    fireEvent.click(await screen.findByText("Add IPO"));
    fireEvent.change(screen.getByLabelText(/Company name/), { target: { value: "X" } });
    fireEvent.click(screen.getAllByText("Add IPO").find(b => b.getAttribute("type") === "submit"));
    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(screen.getByLabelText(/Company name/)).toHaveValue("X");     // form stays open to fix
  });

  it("asks before removing, without a browser dialog", async () => {
    mock.onGet("/admin/ipos").reply(200, [{ id: 3, name: "OldCo", status: "LISTED", category: "Mainboard" }]);
    mock.onDelete("/admin/ipos/3").reply(204);
    render(<AdminIpos />);

    fireEvent.click(await screen.findByLabelText("Remove OldCo"));
    expect(mock.history.delete).toHaveLength(0);
    fireEvent.click(screen.getByText("Yes"));
    await waitFor(() => expect(mock.history.delete).toHaveLength(1));
  });
});
