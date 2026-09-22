import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AboutPage from "./AboutPage";

describe("AboutPage", () => {
    it("introduces the app and says it's a beta", () => {
        render(<AboutPage navigateTo={() => {}} />);
        expect(screen.getByRole("heading", { level: 1, name: /fintwin\.ai/i })).toBeInTheDocument();
        const beta = screen.getByRole("complementary", { name: /beta notice/i });
        expect(beta).toHaveTextContent(/welcome to fintwin\.ai/i);
        expect(beta).toHaveTextContent(/beta build for testing/i);
        expect(beta).toHaveTextContent(/not financial advice/i);
    });

    it("describes every sidebar section and opens it on click", async () => {
        const navigateTo = vi.fn();
        render(<AboutPage navigateTo={navigateTo} />);
        const sections = ["Dashboard", "Analytics", "Transactions", "AI Intelligence", "AI Copilot",
            "AI Spending Coach", "Goals Planner", "Budgeting", "Net Worth", "Investments", "Insurance",
            "Imports", "OCR Uploads", "Executive Reports", "Settings"];
        for (const name of sections) {
            expect(screen.getByRole("button", { name: new RegExp(`^${name}\\b`) })).toBeInTheDocument();
        }
        await userEvent.setup().click(screen.getByRole("button", { name: /^Investments\b/ }));
        expect(navigateTo).toHaveBeenCalledWith("Investments");
    });
});
