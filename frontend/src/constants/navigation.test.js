import { describe, it, expect, beforeEach } from "vitest";
import { TABS, normaliseSection, tabOf, sectionsOf, entryOf, rememberSection, labelOf } from "./navigation";

describe("the app's map", () => {
    beforeEach(() => localStorage.clear());

    it("puts investing right after Home", () => {
        expect(TABS[1].id).toBe("invest");
        expect(TABS[1].sections[0]).toEqual({ name: "Investments", label: "Portfolio" });
    });

    it("has four tabs and puts every section in exactly one", () => {
        expect(TABS.map((t) => t.label)).toEqual(["Home", "Invest", "Spend", "Me"]);
        const all = TABS.flatMap((t) => t.sections.map((s) => s.name));
        expect(new Set(all).size).toBe(all.length);
    });

    it("maps retired and unknown sections onto the tabs", () => {
        expect(normaliseSection("About App")).toBe("Dashboard");
        expect(normaliseSection("Services")).toBe("Dashboard");
        expect(normaliseSection("Discover")).toBe("Explore");
        expect(normaliseSection("Future Twin")).toBe("Future Twin");
        expect(normaliseSection(null)).toBe("Dashboard");
        expect(normaliseSection("Nope")).toBe("Dashboard");
        expect(normaliseSection("Budgeting")).toBe("Budgeting");
        expect(normaliseSection("AI Copilot")).toBe("AI Copilot");
    });

    it("finds a section's tab; the copilot belongs to none", () => {
        expect(tabOf("Budgeting").id).toBe("spend");
        expect(tabOf("Insurance").id).toBe("me");
        expect(tabOf("Goals Planner").id).toBe("invest");
        expect(tabOf("SIPs").id).toBe("invest");
        expect(tabOf("AI Copilot")).toBeNull();
    });

    it("hides Spend Guard unless it's on for this user", () => {
        const spend = TABS.find((t) => t.id === "spend");
        expect(sectionsOf(spend, false).map((s) => s.name)).not.toContain("Spend Guard");
        expect(sectionsOf(spend, true).map((s) => s.name)).toContain("Spend Guard");
    });

    it("reopens a tab where the user left it", () => {
        const invest = TABS.find((t) => t.id === "invest");
        expect(entryOf(invest, false)).toBe("Investments");
        rememberSection("Net Worth");
        expect(entryOf(invest, false)).toBe("Net Worth");
    });

    it("never reopens a gated section for someone it's off for", () => {
        const spend = TABS.find((t) => t.id === "spend");
        rememberSection("Spend Guard");
        expect(entryOf(spend, false)).toBe("Transactions");
    });

    it("labels sections in plain words", () => {
        expect(labelOf("Imports")).toBe("Add data");
        expect(labelOf("AI Copilot")).toBe("Copilot");
    });
});
