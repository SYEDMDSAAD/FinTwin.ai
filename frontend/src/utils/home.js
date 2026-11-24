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

/** At most `max` things that need the user, budgets first, worst first. */
export function attentionItems({ budgets = [], notifications = [], max = 3 }) {
    const items = [];
    for (const b of budgets) {
        const limit = Number(b.limit) || 0;
        const spent = Number(b.spent) || 0;
        if (limit <= 0) continue;
        if (spent > limit) {
            items.push({ tone: "danger", text: `${b.category}: ${rupees(spent - limit)} over your ${rupees(limit)} budget`, to: "Budgeting" });
        } else if (spent >= 0.8 * limit) {
            items.push({ tone: "warning", text: `${b.category}: ${rupees(limit - spent)} left of ${rupees(limit)}`, to: "Budgeting" });
        }
    }
    const notes = [...notifications]
        .filter((n) => n?.message)
        .sort((a, b) => (RANK[a.type] ?? 2) - (RANK[b.type] ?? 2))
        .map((n) => ({ tone: n.type || "info", text: n.message, to: "AI Intelligence" }));
    return [...items, ...notes].slice(0, max);
}
