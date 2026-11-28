import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../services/voice", () => ({
    wakeWordConfigured: vi.fn(() => true),
    chime: vi.fn(),
    phrase: vi.fn(),
    play: vi.fn(),
    recordQuestion: vi.fn(),
    transcribe: vi.fn(),
    ask: vi.fn(),
    speak: vi.fn(),
}));
vi.mock("../services/wakeWord", () => ({ startWakeWord: vi.fn() }));
vi.mock("../context/AuthContext", () => ({ useCurrentUser: () => ({ fullName: "Asha Rao" }) }));

import * as voice from "../services/voice";
import { startWakeWord } from "../services/wakeWord";
import { setWakePref } from "../utils/voicePref";
import VoiceAssistant, { greeting, MISSED } from "./VoiceAssistant";

let wakeUp;
let mic;
beforeEach(() => {
    vi.clearAllMocks();
    try { localStorage.clear(); } catch { /* ignore */ }
    voice.wakeWordConfigured.mockReturnValue(true);
    mic = { pause: vi.fn().mockResolvedValue(), resume: vi.fn().mockResolvedValue(), release: vi.fn().mockResolvedValue() };
    startWakeWord.mockImplementation(async (onWake) => { wakeUp = onWake; return mic; });
    voice.phrase.mockImplementation(async (text) => new Blob([text]));
    voice.play.mockImplementation(() => ({ done: Promise.resolve(), stop: vi.fn() }));
    voice.speak.mockImplementation(() => ({ done: Promise.resolve(), stop: vi.fn() }));
    setWakePref(true);
});

describe("VoiceAssistant", () => {
    it("shows nothing and needs no button: it waits for the wake word", async () => {
        const { container } = render(<VoiceAssistant />);
        await waitFor(() => expect(startWakeWord).toHaveBeenCalledTimes(1));
        expect(container).toBeEmptyDOMElement();
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
        expect(voice.phrase).toHaveBeenCalledWith(greeting("Asha"));   // ready before it's needed
    });

    it("greets by name, opens the page and answers out loud, with no text on screen", async () => {
        voice.recordQuestion.mockReturnValue({ done: Promise.resolve(new Blob(["q"], { type: "audio/webm" })), stop: vi.fn() });
        voice.transcribe.mockResolvedValue("show my portfolio");
        voice.ask.mockResolvedValue("Your portfolio is worth about ₹1.7 lakh, up 11 percent.");
        render(<VoiceAssistant />);
        await waitFor(() => expect(wakeUp).toBeTypeOf("function"));

        await act(async () => { await wakeUp(); });

        expect(mic.pause).toHaveBeenCalled();
        expect(voice.phrase).toHaveBeenCalledWith("Yes, hi Asha. How can I help you today?");
        expect(voice.play).toHaveBeenCalled();
        expect(localStorage.getItem("activeSection")).toBe("Investments");
        expect(voice.ask).toHaveBeenCalledWith("show my portfolio");
        expect(voice.speak).toHaveBeenCalledWith("Your portfolio is worth about ₹1.7 lakh, up 11 percent.");
        expect(screen.queryByText(/₹1.7 lakh/)).not.toBeInTheDocument();
        expect(mic.resume).toHaveBeenCalled();
    });

    it("says it didn't catch that when nothing was said, and never asks the copilot", async () => {
        voice.recordQuestion.mockReturnValue({ done: Promise.resolve(null), stop: vi.fn() });
        render(<VoiceAssistant />);
        await waitFor(() => expect(wakeUp).toBeTypeOf("function"));
        await act(async () => { await wakeUp(); });
        expect(voice.phrase).toHaveBeenCalledWith(MISSED);
        expect(voice.transcribe).not.toHaveBeenCalled();
        expect(voice.ask).not.toHaveBeenCalled();
    });

    it("shows a dot while listening that stops it when tapped", async () => {
        let finish;
        voice.recordQuestion.mockReturnValue({ done: new Promise((r) => { finish = r; }), stop: vi.fn(() => finish(null)) });
        const user = userEvent.setup();
        render(<VoiceAssistant />);
        await waitFor(() => expect(wakeUp).toBeTypeOf("function"));
        act(() => { wakeUp(); });
        const dot = await screen.findByRole("button", { name: /FinTwin is listening/ });
        await user.click(dot);
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
        expect(voice.ask).not.toHaveBeenCalled();
    });

    it("doesn't listen at all when switched off in Settings", async () => {
        setWakePref(false);
        render(<VoiceAssistant />);
        await new Promise((r) => setTimeout(r, 20));
        expect(startWakeWord).not.toHaveBeenCalled();
    });
});
