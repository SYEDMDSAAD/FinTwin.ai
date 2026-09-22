import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockAdapter from "axios-mock-adapter";
import API from "../../services/api";
import AdminTrainingExport from "./AdminTrainingExport";

let mock;
beforeEach(() => {
    mock = new MockAdapter(API);
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
});

describe("AdminTrainingExport", () => {
    it("shows row counts and downloads a dataset", async () => {
        mock.onGet("/admin/training-export").reply(200, { categories: 1200, copilot: 40, anomalies: 12, imports: 9 });
        mock.onGet("/admin/training-export/copilot").reply(200, new Blob(['{"rating":-1}\n']));
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
        const user = userEvent.setup();
        render(<AdminTrainingExport />);

        expect(await screen.findByText("1200 rows")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Download Copilot ratings" }));

        await waitFor(() => expect(click).toHaveBeenCalled());
        expect(mock.history.get.some(r => r.url === "/admin/training-export/copilot")).toBe(true);
    });
});
