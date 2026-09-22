import { describe, it, expect } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "../test/renderPage";
import AnalyticsPage from "./AnalyticsPage";

const iso = (d) => d.toISOString().slice(0, 10);
const monthsAgo = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); d.setDate(10); return d; };

// One payment a month for two years, as the server would return it
const HISTORY = Array.from({ length: 24 }, (_, i) => ({
    id: i + 1, merchant: `Paid to SHOP ${i}`, category: "Food",
    date: iso(monthsAgo(i)), amount: -(100 + i),
}));
const THIS_MONTH = HISTORY.slice(0, 1);

function renderAnalytics() {
    const utils = renderPage(<AnalyticsPage transactions={THIS_MONTH} recurringExpenses={[]} />, { authed: true });
    utils.apiMock.reset();
    utils.apiMock.onGet("/transactions").reply(cfg => [200, cfg.params?.months === 1 ? THIS_MONTH : HISTORY]);
    utils.apiMock.onAny().reply(200, []);
    return utils;
}

const monthsAskedFor = (mock) =>
    mock.history.get.filter(r => r.url === "/transactions").map(r => r.params.months);

describe("AnalyticsPage", () => {
    it("renders without crashing", () => {
        renderPage(<AnalyticsPage transactions={[]} recurringExpenses={[]} />, { authed: true });
        expect(screen.getByText("Analytics")).toBeInTheDocument();
    });

    it("fetches as much history as the chosen period needs", async () => {
        const user = userEvent.setup();
        const { apiMock } = renderAnalytics();
        await waitFor(() => expect(monthsAskedFor(apiMock)).toContain(1));      // "This month" on load

        await user.click(screen.getByText("This month"));
        await user.click(await screen.findByText("All time"));

        await waitFor(() => expect(monthsAskedFor(apiMock)).toContain(0));      // 0 = everything
        expect(await screen.findByText("24 transactions")).toBeInTheDocument();
    });

    it("keeps what it has when a shorter period is picked again", async () => {
        const user = userEvent.setup();
        const { apiMock } = renderAnalytics();
        await user.click(screen.getByText("This month"));
        await user.click(await screen.findByText("All time"));
        await screen.findByText("24 transactions");

        await user.click(screen.getAllByText("All time")[0]);           // the dropdown trigger
        await user.click(await screen.findByText("Last month"));

        await waitFor(() => expect(screen.getByText(/transactions$/)).toBeInTheDocument());
        expect(monthsAskedFor(apiMock).filter(m => m !== 1 && m !== 0)).toEqual([]);   // no refetch
    });
});
