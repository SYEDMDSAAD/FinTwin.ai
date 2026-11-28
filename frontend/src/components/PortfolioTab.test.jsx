import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";

import API from "../services/api";
import PortfolioTab from "./PortfolioTab";

let mock;
beforeEach(() => {
    mock = new MockAdapter(API);
    mock.onGet("/net-worth").reply(200, {});
});

describe("PortfolioTab returns", () => {
    it("shows the portfolio's XIRR and each holding's, marking estimates", async () => {
        mock.onGet("/portfolio").reply(200, {
            totalInvested: 115000, currentValue: 137470, totalPnl: 22470, totalPnlPercent: 19.5, xirr: 12.4,
            allocationByType: { "Mutual Fund": 12, "Fixed Deposit": 88 },
            holdings: [
                { id: 1, name: "Parag Parikh Flexi Cap Fund", type: "Mutual Fund", investedAmount: 15000, currentValue: 16470,
                  pnl: 1470, pnlPercent: 9.8, xirr: 14.1, xirrEstimated: false, source: "CAMS" },
                { id: 2, name: "SBI FD", type: "Fixed Deposit", investedAmount: 100000, currentValue: 121000,
                  pnl: 21000, pnlPercent: 21, xirr: 10, xirrEstimated: true },
                { id: 3, name: "New stock", type: "Stocks", investedAmount: 5000, currentValue: 5100, pnl: 100, pnlPercent: 2, xirr: null },
            ],
        });
        mock.onGet(/.*/).reply(200, []);
        render(<PortfolioTab />);
        expect(await screen.findByText(/12.4% a year \(XIRR\)/)).toBeInTheDocument();
        expect(screen.getByText("14.1% a year")).toBeInTheDocument();
        expect(screen.getByText("10% a year (est.)")).toBeInTheDocument();
        expect(screen.getByText(/from CAMS/)).toBeInTheDocument();
        expect(screen.getAllByText(/% a year/)).toHaveLength(3);
    });
});
