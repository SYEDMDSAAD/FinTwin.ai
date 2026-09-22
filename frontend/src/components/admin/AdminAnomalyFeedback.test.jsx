import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";
import API from "../../services/api";
import AdminAnomalyFeedback from "./AdminAnomalyFeedback";

let mock;
beforeEach(() => { mock = new MockAdapter(API); });

describe("AdminAnomalyFeedback", () => {
    it("shows the false-alarm rate per kind of alert", async () => {
        mock.onGet("/admin/anomalies/feedback-stats").reply(200, {
            confirmed: 3, falseAlarms: 5, falseAlarmRate: 62.5,
            byType: [{ type: "burst", confirmed: 0, falseAlarms: 4, falseAlarmRate: 100.0 },
                     { type: "merchant_spike", confirmed: 3, falseAlarms: 1, falseAlarmRate: 25.0 }],
        });
        render(<AdminAnomalyFeedback />);
        expect(await screen.findByText("Spending burst")).toBeInTheDocument();
        expect(screen.getByText("62.5% false alarms")).toBeInTheDocument();
        expect(screen.getByText("25% false")).toBeInTheDocument();
    });

    it("explains when there's nothing yet", async () => {
        mock.onGet("/admin/anomalies/feedback-stats").reply(200, { confirmed: 0, falseAlarms: 0, falseAlarmRate: null, byType: [] });
        render(<AdminAnomalyFeedback />);
        expect(await screen.findByText(/no verdicts yet/i)).toBeInTheDocument();
    });
});
