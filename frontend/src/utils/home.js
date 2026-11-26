import { rupees } from "./money";

/* The Home screen's numbers, kept apart from its markup so they can be tested. */

/** Days left in this month, today included. */
export function daysLeftInMonth(now = new Date()) {
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return last - now.getDate() + 1;
}

/** The headline: which number to show and how to say it. */
export function headline({ income, spent, budgets = [], now = new Date() }) {
    const days = daysLeftInMonth(now);
    const limit = budgets.reduce((s, b) => s + (Number(b.limit) || 0), 0);
    const used = budgets.reduce((s, b) => s + (Number(b.spent) || 0), 0);

    if (income > 0) {
        const left = income - spent;
        return {
            kind: "income",
            label: "Left this month",
            value: left,
            share: Math.min(1, spent / income),
            note: left > 0
                ? `About ${rupees(left / days)} a day for the ${days} day${days === 1 ? "" : "s"} left`
                : `${rupees(-left)} more went out than came in`,
        };
    }
    if (limit > 0) {
        const left = limit - used;
        return {
            kind: "budgets",
            label: "Left in your budgets",
            value: left,
            share: Math.min(1, used / limit),
            note: left > 0
                ? `About ${rupees(left / days)} a day for the ${days} day${days === 1 ? "" : "s"} left`
                : `${rupees(-left)} over your budgets`,
        };
    }
    return {
        kind: "spent",
        label: "Spent this month",
        value: spent,
        share: null,
        note: "Add this month's income to see what's left",
    };
}

const RANK = { danger: 0, warning: 1, info: 2, success: 3 };

/**
 * At most `max` things that need the user, budgets first, worst first.
 * Each item: { tone, title, detail, to } (text = both, for plain lists).
 * Skips budgets that haven't started yet and rent or bills paid in full, and
 * an alert that only repeats a budget already listed.
 */
export function attentionItems({ budgets = [], notifications = [], max = 3 }) {
    const items = [];
    const listed = [];
    for (const b of budgets) {
        const limit = Number(b.limit) || 0;
        const spent = Number(b.spent) || 0;
        if (limit <= 0 || b.startsOn) continue;
        if (b.fixedCost && spent <= limit) continue;
        if (spent > limit) {
            items.push({ tone: "danger", title: b.category, detail: `${rupees(spent - limit)} over your ${rupees(limit)} budget`, to: "Budgeting" });
            listed.push(String(b.category).toLowerCase());
        } else if (spent >= 0.8 * limit) {
            items.push({ tone: "warning", title: b.category, detail: `${rupees(limit - spent)} left of ${rupees(limit)}`, to: "Budgeting" });
            listed.push(String(b.category).toLowerCase());
        }
    }
    const repeats = (msg) => listed.some((c) => msg.toLowerCase().startsWith(c + " ") && /budget/i.test(msg));
    const notes = [...notifications]
        .filter((n) => n?.message && !repeats(n.message))
        .sort((a, b) => (RANK[a.type] ?? 2) - (RANK[b.type] ?? 2))
        .map((n) => ({ tone: n.type || "info", title: n.message, detail: null, to: "AI Intelligence" }));
    items.sort((a, b) => (RANK[a.tone] ?? 2) - (RANK[b.tone] ?? 2));
    return [...items, ...notes].slice(0, max).map((it) => ({ ...it, text: it.detail ? `${it.title}: ${it.detail}` : it.title }));
}
