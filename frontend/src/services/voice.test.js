import { describe, it, expect, beforeEach, vi } from "vitest";
import MockAdapter from "axios-mock-adapter";
import API from "./api";
import { speak } from "./voice";

let mock;
const played = [];
beforeEach(() => {
    mock = new MockAdapter(API);
    played.length = 0;
    globalThis.URL.createObjectURL = vi.fn((b) => `blob:${b.size}`);
    globalThis.URL.revokeObjectURL = vi.fn();
    globalThis.Audio = class {
        constructor(src) { this.src = src; }
        play() { played.push(this.src); setTimeout(() => this.onended?.(), 0); return Promise.resolve(); }
        pause() {}
    };
});

describe("speak", () => {
    it("voices the next piece while the one before plays, then plays them in order", async () => {
        const asked = [];
        mock.onPost("/voice/speak?encoding=base64").reply((cfg) => {
            asked.push(JSON.parse(cfg.data).text);
            return [200, { audio: btoa("RIFF" + "a".repeat(asked.length)), contentType: "audio/wav" }];
        });
        const onStart = vi.fn();
        await speak("Your portfolio is worth about ₹1.7 lakh, up 11 percent. Your index fund did best this year. Details are on screen.", { onStart }).done;
        expect(asked).toEqual([
            "Your portfolio is worth about ₹1.7 lakh, up 11 percent.",
            "Your index fund did best this year. Details are on screen.",
        ]);
        expect(played).toHaveLength(2);
        expect(onStart).toHaveBeenCalledTimes(1);
    });

    it("finishes quietly when the voice is unavailable: the answer is already on screen", async () => {
        mock.onPost("/voice/speak?encoding=base64").reply(502, { message: "The voice is unavailable." });
        await expect(speak("Hello there, this is your FinTwin answer.").done).resolves.toBeUndefined();
        expect(played).toHaveLength(0);
    });
});
