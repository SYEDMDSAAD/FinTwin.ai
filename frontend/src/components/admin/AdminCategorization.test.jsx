import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";

import API from "../../services/api";
import AdminCategorization from "./AdminCategorization";

let mock;
beforeEach(() => { mock = new MockAdapter(API); });

describe("AdminCategorization", () => {
    it("shows the totals and each method's correction rate", async () => {
        mock.onGet("/admin/categorization/stats").reply(200, {
            transactions: 676, excludedSampleData: 512, reviewedByUsers: 110,
            trainingReadyLabels: 80, usersConsentedToTraining: 3,
            methods: [
                { method: "NONE", transactions: 100, corrected: 30, confirmed: 0, appliedToSimilar: 70, correctionRate: 100.0 },
                { method: "BRAND", transactions: 60, corrected: 1, confirmed: 9, appliedToSimilar: 0, correctionRate: 10.0 },
                { method: "USER", transactions: 4, corrected: 0, confirmed: 0, appliedToSimilar: 0, correctionRate: null },
            ],
        });
        render(<AdminCategorization />);

        expect(await screen.findByText("No match → Other")).toBeInTheDocument();
        expect(screen.getByText("164")).toBeInTheDocument();          // 676 − 512 real transactions
        expect(screen.getByText("80")).toBeInTheDocument();
        expect(screen.getByText("100%")).toBeInTheDocument();
        expect(screen.getByText("10%")).toBeInTheDocument();
        expect(screen.getByText(/512 sandbox and sample rows are left out/)).toBeInTheDocument();
    });

    it("says when there is nothing yet", async () => {
        mock.onGet("/admin/categorization/stats").reply(200, { transactions: 0, methods: [] });
        render(<AdminCategorization />);
        expect(await screen.findByText(/no real transactions yet/i)).toBeInTheDocument();
    });
});
