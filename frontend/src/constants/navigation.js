import { Home, ArrowLeftRight, Sprout, UserRound } from "lucide-react";

/*
 * The app's whole map: four tabs, each a handful of sections.
 *
 * A section is still the unit Dashboard renders (activeSection), so old links,
 * saved state and navigateTo("Budgeting") all keep working. The tab is derived
 * from the section; the label is what the user reads.
 */
export const TABS = [
    {
        id: "home", label: "Home", icon: Home,
        sections: [
            { name: "Dashboard", label: "Overview" },
            { name: "AI Intelligence", label: "AI insights" },
        ],
    },
    {
        id: "spend", label: "Spend", icon: ArrowLeftRight,
        sections: [
            { name: "Transactions", label: "Transactions" },
            // Only for accounts the backend lets in (see useSpendGuardEnabled)
            { name: "Spend Guard", label: "Scan & pay", gated: true },
            { name: "Budgeting", label: "Budgets" },
            { name: "Analytics", label: "Analytics" },
            { name: "AI Spending Coach", label: "Coach" },
        ],
    },
    {
        id: "grow", label: "Grow", icon: Sprout,
        sections: [
            { name: "Goals Planner", label: "Goals" },
            { name: "Investments", label: "Investments" },
            { name: "Net Worth", label: "Net worth" },
            { name: "Insurance", label: "Insurance" },
        ],
    },
    {
        id: "me", label: "Me", icon: UserRound,
        sections: [
            { name: "Imports", label: "Add data" },
            { name: "OCR Uploads", label: "Receipts" },
            { name: "Executive Reports", label: "Reports" },
            { name: "Settings", label: "Settings" },
        ],
    },
];

/** Reached from "Ask AI" on every screen, not from a tab. */
export const COPILOT = "AI Copilot";
export const SPEND_GUARD = "Spend Guard";
export const HOME = "Dashboard";

// Sections that no longer have a place of their own
const RETIRED = {
    "About App": HOME,      // what the app is: that's the landing page's job
    Today: HOME,
    Services: HOME,         // the old mobile hub, replaced by the tabs
    Discover: "Investments",
};

const KNOWN = new Set([COPILOT, ...TABS.flatMap((t) => t.sections.map((s) => s.name))]);

/** A saved or requested section, mapped onto today's map. */
export function normaliseSection(section) {
    const s = RETIRED[section] || section;
    return KNOWN.has(s) ? s : HOME;
}

/** The tab a section lives in, or null for the copilot. */
export function tabOf(section) {
    return TABS.find((t) => t.sections.some((s) => s.name === section)) || null;
}

/** A tab's sections this user can open. */
export function sectionsOf(tab, guardOn) {
    return tab.sections.filter((s) => !s.gated || guardOn);
}

/** Display name for a section. */
export function labelOf(section) {
    if (section === COPILOT) return "Copilot";
    for (const t of TABS) {
        const s = t.sections.find((x) => x.name === section);
        if (s) return s.label;
    }
    return section;
}

const LAST = (tabId) => `lastSection:${tabId}`;

/** Where a tab opens: the section last used in it, else its first. */
export function entryOf(tab, guardOn) {
    const open = sectionsOf(tab, guardOn);
    let last = null;
    try { last = localStorage.getItem(LAST(tab.id)); } catch { /* private mode */ }
    return open.some((s) => s.name === last) ? last : open[0].name;
}

export function rememberSection(section) {
    const tab = tabOf(section);
    if (!tab) return;
    try { localStorage.setItem(LAST(tab.id), section); } catch { /* private mode */ }
}
