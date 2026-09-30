import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";

import API from "../services/api";
import { ThemeProvider } from "../context/ThemeContext";
import CopilotSection from "./CopilotSection";

let mock;
beforeEach(() => {
    mock = new MockAdapter(API);
    // jsdom has no scrolling; the copilot scrolls to its newest message
    Element.prototype.scrollIntoView = vi.fn();
});

const renderCopilot = (props = {}) => render(
    <ThemeProvider>
        <CopilotSection
            chatMessage="How much did I spend on food?"
            setChatMessage={() => {}}
            sendMessage={props.sendMessage || (() => {})}
            messages={[]}
            aiLoading={false}
            selectedMode="Savings Advisor"
            setSelectedMode={() => {}}
            clearChat={() => {}}
            deleteExchange={() => {}}
        />
    </ThemeProvider>
);

describe("CopilotSection when FinTwin AI is offline", () => {
    it("says so up front, points to what still works, and won't send", async () => {
        mock.onGet("/ai/status").reply(200, { available: false, checkedAt: "2026-09-30T12:00:00Z" });
        renderCopilot();

        expect(await screen.findByText("FinTwin AI is offline right now")).toBeInTheDocument();
        expect(screen.getByText(/transactions, budgets, goals and analytics are up to date/)).toBeInTheDocument();
        expect(screen.getByRole("textbox")).toBeDisabled();
        expect(screen.getByTitle("Send")).toBeDisabled();
    });

    it("stays usable when the AI is online", async () => {
        mock.onGet("/ai/status").reply(200, { available: true, checkedAt: "2026-09-30T12:00:00Z" });
        renderCopilot();

        await waitFor(() => expect(mock.history.get.length).toBeGreaterThan(0));
        expect(screen.queryByText("FinTwin AI is offline right now")).not.toBeInTheDocument();
        expect(screen.getByRole("textbox")).toBeEnabled();
        expect(screen.getByTitle("Send")).toBeEnabled();
    });

    it("doesn't lock the copilot when the status itself can't be checked", async () => {
        mock.onGet("/ai/status").networkError();
        renderCopilot();

        await waitFor(() => expect(mock.history.get.length).toBeGreaterThan(0));
        expect(screen.queryByText("FinTwin AI is offline right now")).not.toBeInTheDocument();
        expect(screen.getByRole("textbox")).toBeEnabled();
    });
});
