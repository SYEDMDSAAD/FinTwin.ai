/*
 * "Hey FinTwin, how are my portfolios?" → open Investments → My Portfolio.
 * Keyword rules, checked in order (the most specific first), so the page
 * opens at once while the answer is still being worked out.
 */

const RULES = [
    { words: /\b(future twin|my twin|round[- ]?ups?)\b/, section: "Investments", tab: "Future Twin", label: "Future Twin" },
    { words: /\b(sips?|systematic investment)\b/, section: "Investments", tab: "SIP Tracker", label: "your SIPs" },
    { words: /\b(tax[- ]?harvest\w*|capital gains?|ltcg|health check)\b/, section: "Investments", tab: "My Portfolio", label: "your portfolio" },
    { words: /\b(portfolios?|investments?|invested|holdings?|mutual funds?|funds?|stocks?|shares?|xirr|returns?|nifty|cas)\b/, section: "Investments", tab: "My Portfolio", label: "your portfolio" },
    { words: /\b(net ?worth|assets?|liabilit\w*|loans?|emis?)\b/, section: "Net Worth", label: "net worth" },
    { words: /\b(goals?|saving for|trip|wedding|house fund)\b/, section: "Goals Planner", label: "your goals" },
    { words: /\b(budgets?|limits?|overspen\w*)\b/, section: "Budgeting", label: "your budgets" },
    { words: /\b(insurance|policy|policies|premiums?)\b/, section: "Insurance", label: "insurance" },
    { words: /\b(spend guard|wishlist|pause[ds]?|allowance|top[- ]?ups?|salary day|payday)\b/, section: "Spend Guard", label: "Spend Guard" },
    { words: /\b(reports?|weekly)\b/, section: "Executive Reports", label: "your reports" },
    { words: /\b(spent|spend|spending|kharch\w*|expenses?|transactions?|payments?|paid|swiggy|zomato|amazon|upi)\b/, section: "Transactions", label: "your transactions" },
];

/** Where a spoken question should take the user, or null to stay put. */
export function routeFor(question) {
    const q = String(question || "").toLowerCase();
    for (const r of RULES) {
        if (r.words.test(q)) return { section: r.section, tab: r.tab || null, label: r.label };
    }
    return null;
}

/** Opens a section (and an Investments tab) the way the sidebar does. */
export function openRoute(route) {
    if (!route) return;
    try {
        if (route.tab) localStorage.setItem("investmentsTab", route.tab);
        localStorage.setItem("activeSection", route.section);
    } catch { /* storage blocked: the event still moves the page */ }
    window.dispatchEvent(new Event("dashboardNav"));
}
