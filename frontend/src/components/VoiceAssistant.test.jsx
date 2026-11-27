import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../services/voice", () => ({
    canRecord: () => true,
    wakeWordConfigured: () => false,
    chime: vi.fn(),
    recordQuestion: vi.fn(),
    transcribe: vi.fn(),
    ask: vi.fn(),
    speak: vi.fn(),
}));
vi.mock("../services/wakeWord", () => ({ startWakeWord: vi.fn() }));
import * as voice from "../services/voice";
import { startWakeWord } from "../services/wakeWord";
import VoiceAssistant from "./VoiceAssistant";

beforeEach(() => {
    vi.clearAllMocks();
    try { localStorage.clear(); } catch { /* ignore */ }
});

describe("VoiceAssistant", () => {
    it("hears the question, opens its page, shows and speaks the answer", async () => {
        voice.recordQuestion.mockReturnValue({ done: Promise.resolve(new Blob(["x"], { type: "audio/webm" })), stop: vi.fn() });
        voice.transcribe.mockResolvedValue("how are my portfolios");
        voice.ask.mockResolvedValue("Your portfolio is worth about ₹1.7 lakh, up 11 percent.");
        voice.speak.mockReturnValue({ done: Promise.resolve(), stop: vi.fn() });
        const nav = vi.fn();
        window.addEventListener("dashboardNav", nav);
        const user = userEvent.setup();
        render(<VoiceAssistant />);

        await user.click(screen.getByRole("button", { name: "Ask FinTwin out loud" }));
        expect(await screen.findByText("Your portfolio is worth about ₹1.7 lakh, up 11 percent.")).toBeInTheDocument();
        expect(screen.getByText("“how are my portfolios”")).toBeInTheDocument();
        expect(screen.getByText("Opened your portfolio.")).toBeInTheDocument();
        expect(localStorage.getItem("activeSection")).toBe("Investments");
        expect(localStorage.getItem("investmentsTab")).toBe("My Portfolio");
        expect(nav).toHaveBeenCalled();
        expect(voice.ask).toHaveBeenCalledWith("how are my portfolios");
        expect(voice.speak).toHaveBeenCalledWith("Your portfolio is worth about ₹1.7 lakh, up 11 percent.");
        expect(await screen.findByRole("button", { name: /Ask another/ })).toBeInTheDocument();
        window.removeEventListener("dashboardNav", nav);
    });

    it("says so when nothing was heard, and never asks the copilot", async () => {
        voice.recordQuestion.mockReturnValue({ done: Promise.resolve(null), stop: vi.fn() });
        const user = userEvent.setup();
        render(<VoiceAssistant />);
        await user.click(screen.getByRole("button", { name: "Ask FinTwin out loud" }));
        expect(await screen.findByText(/I didn't catch that/)).toBeInTheDocument();
        expect(voice.transcribe).not.toHaveBeenCalled();
        expect(voice.ask).not.toHaveBeenCalled();
    });

    it("doesn't offer the wake word on a build without a Porcupine key, and never starts it", () => {
        render(<VoiceAssistant />);
        expect(screen.queryByText(/Listen for “Hey FinTwin”/)).not.toBeInTheDocument();
        expect(startWakeWord).not.toHaveBeenCalled();
    });
});
