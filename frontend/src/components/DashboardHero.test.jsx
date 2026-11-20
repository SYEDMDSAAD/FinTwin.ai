import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import DashboardHero from "./DashboardHero";
import { MINUS } from "../utils/money";

describe("DashboardHero", () => {
    it("shows what has been saved over all time, and its share of money in", () => {
        render(<DashboardHero score={64} allTime={{ savings: 6522, income: 164286, from: "2026-06-24" }} />);

        expect(screen.getByText("SAVED ALL TIME")).toBeInTheDocument();
        expect(screen.getByText("+₹6,522")).toBeInTheDocument();
        expect(screen.getByText("4% of money in")).toBeInTheDocument();
        expect(screen.getByText("+₹6,522").closest(".metric-pill"))
            .toHaveAttribute("title", expect.stringContaining("Since 24 Jun 2026"));
    });

    it("writes an all-time loss with a minus sign", () => {
        render(<DashboardHero score={40} allTime={{ savings: -1200, income: 10000, from: "2026-06-24" }} />);

        expect(screen.getByText(`${MINUS}₹1,200`)).toBeInTheDocument();
        expect(screen.getByText(`${MINUS}12% of money in`)).toBeInTheDocument();
    });

    it("shows a dash until the figures arrive", () => {
        render(<DashboardHero score={0} allTime={null} />);
        expect(screen.getByText("—")).toBeInTheDocument();
    });
});
