import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";
import API from "../services/api";
import AnomalyAlerts from "./AnomalyAlerts";

const A = [
  { type: "merchant_spike", merchant: "SWIGGY", category: "Food", amount: 1200, severity: "high", reason: "4x your usual Swiggy order" },
  { type: "large_transaction", merchant: "MAKEMYTRIP", category: "Travel", amount: 9000, severity: "medium", reason: "Largest payment this month" },
  { type: "burst", merchant: "", category: "Shopping", amount: 3000, severity: "low", reason: "6 payments in one day" },
];

describe("AnomalyAlerts", () => {
  let mock;
  beforeEach(() => { mock = new MockAdapter(API); });
  afterEach(() => { mock.restore(); });

  it("dismissing one card doesn't leave the next one stuck on Dismissing…", async () => {
    mock.onPost("/anomalies/dismiss").reply(204);
    render(<AnomalyAlerts anomalies={A} />);

    fireEvent.click(screen.getAllByText("Not an anomaly")[0]);

    await waitFor(() => expect(screen.queryByText("4x your usual Swiggy order")).not.toBeInTheDocument());
    // the card that moved up is its own, fully usable card
    expect(screen.queryByText("Dismissing…")).not.toBeInTheDocument();
    expect(screen.getAllByText("Not an anomaly")).toHaveLength(2);
    expect(screen.getAllByText("Not an anomaly")[0].closest("button")).toBeEnabled();
    expect(JSON.parse(mock.history.post[0].data)).toMatchObject({ type: "merchant_spike", merchant: "SWIGGY" });
  });

  it("shows anomalies that arrive after it has mounted", () => {
    const { rerender } = render(<AnomalyAlerts anomalies={[]} />);
    expect(screen.getByText("No Anomalies Detected")).toBeInTheDocument();

    rerender(<AnomalyAlerts anomalies={A} />);
    expect(screen.getByText("Unusual Spending Detected")).toBeInTheDocument();
    expect(screen.getByText("3 total")).toBeInTheDocument();
  });

  it("keeps a dismissed pattern hidden when the list is reloaded", async () => {
    mock.onPost("/anomalies/dismiss").reply(204);
    const { rerender } = render(<AnomalyAlerts anomalies={A} />);
    fireEvent.click(screen.getAllByText("Not an anomaly")[0]);
    await waitFor(() => expect(screen.getByText("2 total")).toBeInTheDocument());

    rerender(<AnomalyAlerts anomalies={[...A]} />);
    expect(screen.queryByText("4x your usual Swiggy order")).not.toBeInTheDocument();
  });

  it("puts the button back if the dismiss fails", async () => {
    mock.onPost("/anomalies/dismiss").reply(500);
    render(<AnomalyAlerts anomalies={A.slice(0, 1)} />);

    fireEvent.click(screen.getByText("Not an anomaly"));

    await waitFor(() => expect(screen.getByText("Not an anomaly").closest("button")).toBeEnabled());
    expect(screen.getByText("4x your usual Swiggy order")).toBeInTheDocument();
  });

  it("\"Yes, that was odd\" records the alert's figures and keeps the card", async () => {
    mock.onPost("/anomalies/confirm").reply(204);
    render(<AnomalyAlerts anomalies={[{ ...A[0], avgAmount: 300, multiplier: 4 }]} />);

    fireEvent.click(screen.getByText("Yes, that was odd"));

    expect(await screen.findByText("You marked this as unusual")).toBeInTheDocument();
    expect(screen.getByText("4x your usual Swiggy order")).toBeInTheDocument();
    expect(JSON.parse(mock.history.post[0].data)).toEqual({
      type: "merchant_spike", merchant: "SWIGGY", category: "Food",
      amount: 1200, avgAmount: 300, multiplier: 4, severity: "high",
    });
  });

  it("dismissing sends the same figures", async () => {
    mock.onPost("/anomalies/dismiss").reply(204);
    render(<AnomalyAlerts anomalies={[A[1]]} />);
    fireEvent.click(screen.getByText("Not an anomaly"));
    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(JSON.parse(mock.history.post[0].data)).toMatchObject({ type: "large_transaction", amount: 9000, severity: "medium" });
  });
});
