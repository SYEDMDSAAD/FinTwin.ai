import { describe, it, expect } from "vitest";
import { routeFor } from "./voiceRoute";
import { speakable, pieces, MAX_SPOKEN } from "./voiceText";

describe("voice routing", () => {
    it("opens the page the question is about", () => {
        expect(routeFor("how are my portfolios")).toEqual({ section: "Investments", label: "your portfolio" });
        expect(routeFor("how much do my SIPs add up to")?.section).toBe("SIPs");
        expect(routeFor("what will my future twin have")?.section).toBe("Future Twin");
        expect(routeFor("Kitna kharcha hua Swiggy pe last month?")?.section).toBe("Transactions");
        expect(routeFor("am I on track for the Goa trip")?.section).toBe("Goals Planner");
        expect(routeFor("what's my net worth")?.section).toBe("Net Worth");
        expect(routeFor("tell me a joke")).toBeNull();
    });
});

describe("voice text", () => {
    it("reads the words, not the markdown", () => {
        expect(speakable("**Your portfolio** is worth ₹1.7 lakh.\n\n- Best: Nifty 50\n- XIRR: 8.9%"))
            .toBe("Your portfolio is worth ₹1.7 lakh. Best: Nifty 50. XIRR: 8.9%");
    });

    it("keeps a long answer to a few sentences", () => {
        const long = Array.from({ length: 40 }, (_, i) => `Sentence ${i} is about money.`).join(" ");
        expect(speakable(long).length).toBeLessThanOrEqual(MAX_SPOKEN);
    });

    it("splits into pieces that each play while the next is voiced", () => {
        const p = pieces("Your portfolio is worth about ₹1.7 lakh, up 11 percent. Your index fund did best this year. Details are on screen.");
        expect(p).toEqual([
            "Your portfolio is worth about ₹1.7 lakh, up 11 percent.",
            "Your index fund did best this year. Details are on screen.",
        ]);
        expect(pieces("")).toEqual([]);
    });
});
