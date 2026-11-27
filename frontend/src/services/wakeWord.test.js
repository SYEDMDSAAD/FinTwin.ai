import { describe, it, expect } from "vitest";
import { downsample, KEYWORDS } from "./wakeWord";

describe("wake word", () => {
    it("brings 48 kHz mic audio down to the model's 16 kHz", () => {
        const input = new Float32Array(4800).map((_, i) => (i % 3 === 0 ? 0.3 : 0));
        const out = downsample(input, 48000);
        expect(out).toHaveLength(1600);
        expect(out[0]).toBeCloseTo(0.1, 5);
        expect(downsample(new Float32Array([0.5, -0.5]), 16000)).toEqual(new Float32Array([0.5, -0.5]));
    });

    it("listens for the spellings an accent produces", () => {
        expect(KEYWORDS.split("\n")).toEqual(["▁HE Y ▁F IN T W IN", "▁HE Y ▁F IN ▁T W IN", "▁HE Y ▁F IN N ▁T W IN"]);
    });
});
