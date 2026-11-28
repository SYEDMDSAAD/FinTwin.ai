import { describe, it, expect } from "vitest";
import { parseMode, DEFAULT_MODE } from "./aiPrefs";

describe("parseMode", () => {
    it("reads the plain string Settings stored", () => {
        expect(parseMode("Budget Coach")).toBe("Budget Coach");
    });
    it("reads the JSON list onboarding used to store, taking the first", () => {
        expect(parseMode('["Investment Advisor","Budget Coach"]')).toBe("Investment Advisor");
    });
    it("falls back for nothing, junk or an unknown mode", () => {
        expect(parseMode(null)).toBe(DEFAULT_MODE);
        expect(parseMode("[broken")).toBe(DEFAULT_MODE);
        expect(parseMode("Stock Tipster")).toBe(DEFAULT_MODE);
    });
});
