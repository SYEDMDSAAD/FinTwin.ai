import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockAdapter from "axios-mock-adapter";

import API from "../services/api";
import ImportCas from "./ImportCas";

let mock;
beforeEach(() => { mock = new MockAdapter(API); });

const pdf = () => new File(["%PDF-1.4"], "cas.pdf", { type: "application/pdf" });

async function fillAndImport(user) {
    await user.click(screen.getByRole("button", { name: "Import statement" }));
    await user.upload(screen.getByLabelText("CAS PDF"), pdf());
    await user.type(screen.getByLabelText("Statement password"), "ABCDE1234F");
    await user.click(screen.getByRole("button", { name: "Import" }));
}

describe("ImportCas", () => {
    it("imports a statement and says what it brought in", async () => {
        let sent;
        mock.onPost("/portfolio/import-cas").reply((cfg) => { sent = cfg.data; return [200, { added: 4, updated: 1, transactions: 60, source: "CAMS", statementTo: "2026-11-25" }]; });
        const onImported = vi.fn();
        const user = userEvent.setup();
        render(<ImportCas onImported={onImported} />);
        expect(screen.getByRole("button", { name: "Import statement" })).toBeInTheDocument();
        await fillAndImport(user);
        expect(await screen.findByText(/CAMS statement: 4 new, 1 updated, units as of 25 Nov 2026/)).toBeInTheDocument();
        expect(onImported).toHaveBeenCalled();
        expect(sent.get("password")).toBe("ABCDE1234F");
        expect(screen.getByLabelText("Statement password")).toHaveValue("");
    });

    it("says when the password is wrong", async () => {
        mock.onPost("/portfolio/import-cas").reply(422, { code: "password_incorrect", error: "x" });
        const user = userEvent.setup();
        render(<ImportCas />);
        await fillAndImport(user);
        expect(await screen.findByText("That password didn't open it. Try again.")).toBeInTheDocument();
    });
});
