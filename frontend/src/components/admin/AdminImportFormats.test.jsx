import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockAdapter from "axios-mock-adapter";
import API from "../../services/api";
import AdminImportFormats from "./AdminImportFormats";

let mock;
beforeEach(() => { mock = new MockAdapter(API); });

describe("AdminImportFormats", () => {
    it("lists formats with their fix rate and shows what was changed", async () => {
        mock.onGet("/admin/imports/formats").reply(200, [{
            formatKey: "abc", headers: ["Date", "Transaction Details", "Type", "Amount"], fileType: "pdf",
            imports: 4, users: 3, fixedByHand: 3, fixRate: 75.0,
            lastDetected: { date: "Date", merchant: "Transaction Details", amount: "Amount" },
            lastFinal: { date: "Date", merchant: "Transaction Details", amount: "Amount", direction: "Type" },
        }]);
        const user = userEvent.setup();
        render(<AdminImportFormats />);

        expect(await screen.findByText("Date · Transaction Details · Type · Amount")).toBeInTheDocument();
        expect(screen.getByText("3 fixed (75%)")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { expanded: false }));
        const row = screen.getByText("direction").closest("tr");
        expect(row).toHaveTextContent("direction—Type");
    });

    it("says when there are no imports yet", async () => {
        mock.onGet("/admin/imports/formats").reply(200, []);
        render(<AdminImportFormats />);
        expect(await screen.findByText(/no statement imports yet/i)).toBeInTheDocument();
    });
});
