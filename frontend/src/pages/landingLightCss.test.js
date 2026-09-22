import { describe, it, expect } from "vitest";
import { toLight } from "./landingLightCss";

describe("toLight", () => {
    it("turns the dark page into a light one", () => {
        const out = toLight(".land { background: #060810; color: #e2e8f0; }");
        expect(out).toBe(".land { background: #f6f7fb; color: #0f172a; }");
    });

    it("treats a white overlay by what it is used for", () => {
        expect(toLight(".card { background: rgba(255,255,255,0.025); }")).toContain("rgba(255,255,255,0.85)");
        expect(toLight(".card { border: 1px solid rgba(255,255,255,0.07); }")).toContain("rgba(15,23,42,0.11)");
        expect(toLight(".row:hover { background: rgba(255,255,255,0.08); }")).toContain("rgba(15,23,42,0.05)");
    });

    it("darkens accent text but leaves brand fills and gradients alone", () => {
        expect(toLight(".tag { color: #a78bfa; }")).toBe(".tag { color: #6d28d9; }");
        const grad = ".btn { background: linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%); color: #fff; }";
        expect(toLight(grad)).toBe(grad);
    });

    it("softens black shadows and recessed panels", () => {
        expect(toLight(".c { box-shadow: 0 20px 60px rgba(0,0,0,0.35); }")).toContain("rgba(15,23,42,0.11)");
        expect(toLight(".inset { background: rgba(0,0,0,0.22); }")).toContain("rgba(15,23,42,0.04)");
    });

    it("never touches selectors, only property values", () => {
        const css = ".lnav-link:hover { color: #e2e8f0; }\n@media(max-width:768px){ .x { display: none; } }";
        expect(toLight(css)).toBe(".lnav-link:hover { color: #0f172a; }\n@media(max-width:768px){ .x { display: none; } }");
    });
});
