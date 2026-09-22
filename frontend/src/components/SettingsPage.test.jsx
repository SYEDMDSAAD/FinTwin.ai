import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderPage } from "../test/renderPage";
import SettingsPage from "./SettingsPage";

function openAccount(consent) {
    const utils = renderPage(<SettingsPage navigateTo={() => {}} />, { authed: true });
    utils.apiMock.reset();
    utils.apiMock.onGet("/profile/training-consent").reply(200, { given: consent });
    utils.apiMock.onPut("/profile/training-consent").reply(cfg => [200, { given: JSON.parse(cfg.data).given }]);
    utils.apiMock.onAny().reply(200, {});
    return utils;
}

describe("SettingsPage — training consent", () => {
    it("is off by default and turns on with a saved opt-in", async () => {
        const user = userEvent.setup();
        const { apiMock } = openAccount(false);
        await user.click(screen.getByRole("button", { name: /account/i }));

        const toggle = await screen.findByRole("switch", { name: /help improve fintwin's ai/i });
        expect(toggle).toHaveAttribute("aria-checked", "false");

        await user.click(toggle);
        await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
        expect(JSON.parse(apiMock.history.put.at(-1).data)).toEqual({ given: true });
    });

    it("can be turned off again", async () => {
        const user = userEvent.setup();
        const { apiMock } = openAccount(true);
        await user.click(screen.getByRole("button", { name: /account/i }));

        const toggle = await screen.findByRole("switch", { name: /help improve fintwin's ai/i });
        await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
        await user.click(toggle);
        await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
        expect(JSON.parse(apiMock.history.put.at(-1).data)).toEqual({ given: false });
    });
});
