import { Sparkles } from "lucide-react";
import { SectionHeader, Badge, cx } from "./ui";
import { SERIES } from "./ui/chartTheme";
import { rupees } from "../utils/money";

/*
 * The suggested split of monthly savings across kinds of investment: one
 * number up top, the profile as rows, the split as one bar plus rows.
 */

const riskTone = (risk = "") => {
    const r = risk.toLowerCase();
    if (r.includes("aggressive")) return "bad";
    if (r.includes("moderate")) return "warn";
    return "good";
};

const scoreLabel = (score) =>
    score >= 85 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Average" : "Needs work";

function InvestmentRecommendationSection({ recommendation }) {
    if (!recommendation) return null;

    const items = recommendation.recommendations || [];
    const rows = [
        { label: "Risk profile", value: <Badge tone={riskTone(recommendation.riskProfile)}>{recommendation.riskProfile}</Badge> },
        { label: "Expected return", note: "A range, not a promise", value: recommendation.expectedReturn },
        { label: "Horizon", value: recommendation.investmentHorizon },
        { label: "Plan score", note: scoreLabel(recommendation.portfolioScore), value: `${recommendation.portfolioScore} / 100` },
    ];

    return (
        <div className="max-w-2xl space-y-8">
            <section aria-label="To invest each month" className="px-1">
                <p className="text-small text-ink-3">You could invest each month</p>
                <p className="text-hero text-ink num mt-1">{rupees(recommendation.monthlyInvestableAmount || 0)}</p>
                <p className="mt-2 text-body text-ink-2">Worked out from your income, spending and goals</p>
            </section>

            <ul className="rounded-card bg-surface border border-line divide-y divide-line">
                {rows.map((r) => (
                    <li key={r.label} className="flex items-center justify-between gap-3 px-4 py-3.5">
                        <span className="min-w-0">
                            <span className="block text-body text-ink">{r.label}</span>
                            {r.note && <span className="block text-small text-ink-3">{r.note}</span>}
                        </span>
                        <span className="text-body font-semibold text-ink num text-right">{r.value}</span>
                    </li>
                ))}
            </ul>

            {items.length > 0 && (
                <section aria-label="Suggested mix">
                    <SectionHeader title="Suggested mix" />
                    <div className="rounded-card bg-surface border border-line">
                        <div className="p-4 pb-3">
                            <div className="flex h-2 gap-0.5 rounded-full overflow-hidden" aria-hidden>
                                {items.map((it, i) => (
                                    <div key={it.asset} style={{ width: `${it.allocation}%`, background: SERIES[i % SERIES.length], minWidth: 3 }} />
                                ))}
                            </div>
                        </div>
                        <ul className="divide-y divide-line border-t border-line">
                            {items.map((it, i) => (
                                <li key={it.asset} className="flex items-start gap-3 px-4 py-3.5">
                                    <span aria-hidden className="shrink-0 mt-1.5 w-2.5 h-2.5 rounded-full" style={{ background: SERIES[i % SERIES.length] }} />
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-baseline justify-between gap-3">
                                            <span className="text-body text-ink">{it.asset}</span>
                                            <span className="text-body font-semibold text-ink num shrink-0">{rupees(it.amount || 0)}</span>
                                        </span>
                                        <span className="flex items-start justify-between gap-3">
                                            <span className="text-small text-ink-3">{it.reason}</span>
                                            <span className="text-small text-ink-3 num shrink-0">{it.allocation}%</span>
                                        </span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>
            )}

            {recommendation.summary && (
                <section aria-label="In short">
                    <SectionHeader title="In short" />
                    <div className="flex gap-3 px-1">
                        <Sparkles size={16} aria-hidden className="shrink-0 mt-1 text-accent" />
                        <p className="text-body text-ink-2 leading-relaxed">{recommendation.summary}</p>
                    </div>
                </section>
            )}

            <p className={cx("px-1 text-caption text-ink-3 leading-5")}>
                <span className="font-semibold text-ink-2">Educational estimate — not investment advice.</span>{" "}
                These allocations are generated automatically from your own
                income, spending and goal data. FinTwin is not a SEBI-registered
                investment adviser, and nothing here is a personal
                recommendation to buy or sell any security. Returns shown are
                illustrative ranges, not guarantees — market-linked investments
                can lose value. Consult a SEBI-registered adviser before acting.
            </p>
        </div>
    );
}

export default InvestmentRecommendationSection;
