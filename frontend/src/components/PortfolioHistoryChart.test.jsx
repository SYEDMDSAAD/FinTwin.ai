import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";

import API from "../services/api";
import PortfolioHistoryChart from "./PortfolioHistoryChart";

let mock;
beforeEach(() => { mock = new MockAdapter(API); });

describe("PortfolioHistoryChart", () => {
    it("draws once there are three months", async () => {
        mock.onGet("/portfolio/history").reply(200, { funds: 2, months: [
            { month: "2026-09", invested: 5000, value: 5100 },
            { month: "2026-10", invested: 10000, value: 10500 },
            { month: "2026-11", invested: 7600, value: 8300 }] });
        render(<PortfolioHistoryChart />);
        expect(await screen.findByText("Value over time")).toBeInTheDocument();
        expect(screen.getByText("2 funds from your statement")).toBeInTheDocument();
    });

    it("stays hidden with too little history", async () => {
        mock.onGet("/portfolio/history").reply(200, { funds: 1, months: [{ month: "2026-11", invested: 1, value: 1 }] });
        const { container } = render(<PortfolioHistoryChart />);
        await new Promise((r) => setTimeout(r, 20));
        expect(container).toBeEmptyDOMElement();
    });
});
