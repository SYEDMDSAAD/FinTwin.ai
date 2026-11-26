import { ArrowUp, ArrowDown, Sparkles } from "lucide-react";
import { rupees, percent, dayRange, changeTone, GOOD, BAD } from "../utils/money";
import { cx } from "./ui";

/*
 * This month at a glance: what was saved as the one big number, then money
 * in, money out and next month's prediction as rows. Each change is measured
 * against the same days of last month.
 */

const toneOf = (hex) => (hex === GOOD ? "good" : hex === BAD ? "bad" : "neutral");
const TONE_CLASS = { good: "text-good", bad: "text-bad", neutral: "text-ink-3" };

function Trend({ id, c }) {
    return (
        <span data-testid={`trend-${id}`} data-tone={c.tone} title={c.title}
              className={cx("inline-flex items-center gap-0.5 text-small font-medium num", TONE_CLASS[c.tone])}>
            {c.icon}{c.trend}
        </span>
    );
}

function AnalyticsCards({ income, expenses, savings, prediction, incomeTrend, expenseTrend, savingsTrend, compared = {} }) {
    const range = dayRange(compared.from, compared.to);
    const against = range ? `vs ${range}` : "vs last month";

    // The arrow follows the change itself; the colour says whether that's
    // good: more income or savings is, more spending isn't.
    const change = (trend, before, goodWhenUp) => {
        if (before === 0) {
            return {
                trend: "—",
                icon: null,
                tone: "neutral",
                title: range ? `Nothing on record for ${range} to compare with` : "Nothing to compare with yet",
            };
        }
        const n = Number(trend) || 0;
        return {
            trend: percent(n, { plus: true }),
            icon: n < 0 ? <ArrowDown size={13} aria-hidden /> : n > 0 ? <ArrowUp size={13} aria-hidden /> : null,
            tone: toneOf(changeTone(n, goodWhenUp)),
            title: before == null ? "" : `${rupees(before)} on ${range || "last month"}`,
        };
    };

    const saved = change(savingsTrend, compared.savings, true);
    const rows = [
        { id: "Total Income", label: "Money in", value: income, c: change(incomeTrend, compared.income, true) },
        { id: "Total Expenses", label: "Money out", value: Math.abs(expenses), c: change(expenseTrend, compared.expenses, false) },
    ];

    return (
        <section aria-label="This month" className="max-w-2xl mb-8">
            <div className="px-1">
                <p className="text-small text-ink-3">{savings < 0 ? "Overspent this month" : "Saved this month"}</p>
                <p className={cx("text-hero num mt-1", savings < 0 ? "text-bad" : "text-ink")}>{rupees(savings)}</p>
                <p className="mt-2 flex items-center gap-2 text-small text-ink-3">
                    <Trend id="Net Savings" c={saved} />
                    <span>{`This month · ${against}`}</span>
                </p>
            </div>

            <ul className="mt-6 rounded-card bg-surface border border-line divide-y divide-line">
                {rows.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                        <span className="min-w-0">
                            <span className="block text-body text-ink">{r.label}</span>
                            <span className="block text-small text-ink-3">{`This month · ${against}`}</span>
                        </span>
                        <span className="text-right shrink-0">
                            <span className="block text-body font-semibold text-ink num">{rupees(r.value)}</span>
                            <Trend id={r.id} c={r.c} />
                        </span>
                    </li>
                ))}
                <li className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-body text-ink">
                            Predicted spending <Sparkles size={14} aria-hidden className="text-accent" />
                        </span>
                        <span className="block text-small text-ink-3">Next month</span>
                    </span>
                    <span className="shrink-0 text-body font-semibold text-ink num">{rupees(prediction || 0)}</span>
                </li>
            </ul>
        </section>
    );
}

export default AnalyticsCards;
