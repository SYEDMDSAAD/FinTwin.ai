import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { percent } from "../utils/money";
import { Badge, Progress, cx } from "./ui";

/* The health score: the number, what it means, and what's behind it. */

function tone(score) {
    if (score >= 70) return "good";
    if (score >= 50) return "warn";
    return "bad";
}

const RING = { good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)" };

function Ring({ score, color }) {
    const r = 34;
    const c = 2 * Math.PI * r;
    const [shown, setShown] = useState(0);
    useEffect(() => {
        const t = setTimeout(() => setShown(score), 150);
        return () => clearTimeout(t);
    }, [score]);
    return (
        <svg width="84" height="84" viewBox="0 0 84 84" className="-rotate-90 shrink-0" aria-hidden>
            <circle cx="42" cy="42" r={r} fill="none" stroke="var(--bg-input)" strokeWidth="8" />
            <circle cx="42" cy="42" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${c * (shown / 100)} ${c}`}
                    style={{ transition: "stroke-dasharray 900ms cubic-bezier(0.22,1,0.36,1)" }} />
        </svg>
    );
}

const SUMMARY = (score) =>
    score >= 85 ? "Strong savings and steady budgets. Money left over each month could start working for you."
    : score >= 70 ? "Stable. Tightening one or two categories would lift you into the top band."
    : score >= 50 ? "Middling. The lowest factors below are where small changes count most."
    : "At risk. Bring spending under 80% of income and set a budget for your biggest category first.";

const FACTOR_TONE = { good: "good", warning: "warn", poor: "bad" };

function FinancialScoreCard({ scoreData }) {
    const [open, setOpen] = useState(true);
    if (!scoreData) return null;

    const t = tone(scoreData.score);
    const savings = Number(scoreData.savingsRatio);
    const rows = [
        { label: "Savings rate", note: "last 3 months", value: percent(scoreData.savingsRatio), cls: savings < 0 ? "text-bad" : "text-ink" },
        { label: "Budget discipline", note: "this month", value: `${scoreData.budgetDiscipline}%`, cls: "text-ink" },
        { label: "Recurring payments", note: "subscriptions, bills, EMIs", value: String(scoreData.recurringExpenseCount ?? 0), cls: "text-ink" },
    ];

    return (
        <section aria-label="Health score" className="max-w-2xl mb-8 space-y-4">
            <div className="rounded-card bg-surface border border-line p-5">
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <Ring score={scoreData.score} color={RING[t]} />
                        <span className="absolute inset-0 flex items-center justify-center text-[22px] font-[650] tracking-[-0.03em] text-ink num">
                            {scoreData.score}
                        </span>
                    </div>
                    <div className="min-w-0">
                        <p className="text-small text-ink-3">Health score</p>
                        <p className="text-title text-ink mt-0.5">
                            {scoreData.score}<span className="text-ink-3 text-heading font-medium"> / 100</span>
                        </p>
                        <Badge tone={t} className="mt-1.5">{scoreData.rating}</Badge>
                    </div>
                </div>
                <p className="mt-4 text-body text-ink-2">{SUMMARY(scoreData.score)}</p>
            </div>

            <ul className="rounded-card bg-surface border border-line divide-y divide-line">
                {rows.map((r) => (
                    <li key={r.label} className="flex items-center justify-between gap-3 px-4 py-3.5">
                        <span className="min-w-0">
                            <span className="block text-body text-ink">{r.label}</span>
                            <span className="block text-small text-ink-3">{r.note}</span>
                        </span>
                        <span className={cx("text-body font-semibold num", r.cls)}>{r.value}</span>
                    </li>
                ))}
            </ul>

            {scoreData.factors?.length > 0 && (
                <div className="rounded-card bg-surface border border-line">
                    <button
                        type="button"
                        onClick={() => setOpen((o) => !o)}
                        aria-expanded={open}
                        className="w-full flex items-center justify-between px-4 py-3.5 text-left"
                    >
                        <span>
                            <span className="block text-heading text-ink">What's behind the score</span>
                            <span className="block text-small text-ink-3">Last 3 months</span>
                        </span>
                        <ChevronDown size={18} aria-hidden className={cx("text-ink-3 transition-transform", open && "rotate-180")} />
                    </button>
                    {open && (
                        <ul className="divide-y divide-line border-t border-line">
                            {scoreData.factors.map((f) => {
                                const pct = f.maxPoints > 0 ? (f.points / f.maxPoints) * 100 : 0;
                                const ft = FACTOR_TONE[f.status] || "accent";
                                return (
                                    <li key={f.label} className="px-4 py-3.5">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <span className="text-body text-ink">{f.label}</span>
                                            <span className="text-small text-ink-3 num shrink-0">{f.points} of {f.maxPoints}</span>
                                        </div>
                                        <Progress className="mt-2" value={pct} tone={ft} label={f.label} />
                                        {f.desc && <p className="mt-2 text-small text-ink-3">{f.desc}</p>}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </section>
    );
}

export default FinancialScoreCard;
