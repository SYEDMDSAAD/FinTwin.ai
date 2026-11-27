import { useEffect, useState } from "react";
import API from "../services/api";
import { SectionHeader, Progress, Button } from "./ui";
import { SERIES } from "./ui/chartTheme";
import { rupees } from "../utils/money";

/*
 * The Plan tab: the user's own numbers added up. What's left each month,
 * how far the emergency fund reaches, what each goal needs, what's already
 * going into SIPs, and where the money sits now. No suggested mix: telling
 * one person how to split their money is investment advice, and FinTwin
 * isn't a SEBI-registered adviser.
 */

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function InvestmentPlanSection() {
    const [plan, setPlan] = useState(null);
    const [failed, setFailed] = useState(false);

    const load = () => {
        setFailed(false);
        API.get("/investments/plan").then((r) => setPlan(r.data)).catch(() => setFailed(true));
    };
    useEffect(load, []);

    if (failed) {
        return (
            <div className="max-w-2xl rounded-card bg-surface border border-line p-5">
                <p className="text-body text-ink-2 mb-3">Couldn't load your plan.</p>
                <Button size="sm" variant="secondary" onClick={load}>Try again</Button>
            </div>
        );
    }
    if (!plan) {
        return (
            <div className="max-w-2xl rounded-card bg-surface border border-line px-6 py-10 text-center text-small text-ink-3" role="status">
                Adding up your numbers…
            </div>
        );
    }

    const { emergency: em, goals = [], mix = [] } = plan;
    const noData = !plan.monthlyIncome && !plan.monthlySpend;
    const surplus = plan.monthlySurplus;
    const left = plan.leftAfterGoals;

    return (
        <div className="max-w-2xl space-y-8">
            <section aria-label="Left over each month" className="px-1">
                <p className="text-small text-ink-3">Left over each month</p>
                <p className="text-hero text-ink num mt-1">{rupees(surplus)}</p>
                <p className="mt-2 text-body text-ink-2">
                    {noData
                        ? "Add your transactions and this fills in from your income and spending."
                        : <>Income {rupees(plan.monthlyIncome)} minus spending {rupees(plan.monthlySpend)}, the average of the last 3 months.</>}
                </p>
            </section>

            {!noData && (
                <section aria-label="Emergency fund">
                    <SectionHeader title="Emergency fund" />
                    <div className="rounded-card bg-surface border border-line p-4 space-y-3">
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="text-body text-ink">Covers {em.monthsCovered} months of spending</span>
                            <span className="text-body font-semibold text-ink num">{rupees(em.saved)}</span>
                        </div>
                        <Progress value={(em.monthsCovered / em.targetMonths) * 100} tone={em.shortfall > 0 ? "warn" : "good"} label="Emergency fund" />
                        <p className="text-small text-ink-3">
                            {em.shortfall > 0
                                ? <>A common rule of thumb is {em.targetMonths} months. That's {rupees(em.shortfall)} more.</>
                                : <>That's at least the {em.targetMonths} months a common rule of thumb asks for.</>}
                        </p>
                    </div>
                </section>
            )}

            <section aria-label="Goals">
                <SectionHeader title="What your goals need" />
                {goals.length === 0 ? (
                    <p className="px-1 text-body text-ink-2">No open goals. Add one under Goals and its monthly amount shows here.</p>
                ) : (
                    <div className="rounded-card bg-surface border border-line">
                        <ul className="divide-y divide-line">
                            {goals.map((g) => (
                                <li key={g.id} className="px-4 py-3.5 space-y-2">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <span className="text-body text-ink min-w-0 truncate">{g.title}</span>
                                        <span className="text-body font-semibold text-ink num shrink-0">{rupees(g.monthlyNeeded)}/mo</span>
                                    </div>
                                    <Progress value={g.target ? (g.saved / g.target) * 100 : 0} label={g.title} />
                                    <p className="text-small text-ink-3 num">
                                        {rupees(g.saved)} of {rupees(g.target)} · {plural(g.monthsLeft, "month")} left
                                    </p>
                                </li>
                            ))}
                        </ul>
                        <div className="flex items-baseline justify-between gap-3 px-4 py-3.5 border-t border-line">
                            <span className="text-body text-ink">{left >= 0 ? "Left after goals" : "Short each month"}</span>
                            <span className={`text-body font-semibold num ${left >= 0 ? "text-ink" : "text-bad"}`}>{rupees(Math.abs(left))}</span>
                        </div>
                    </div>
                )}
            </section>

            <section aria-label="Already investing">
                <SectionHeader title="Already investing" />
                <ul className="rounded-card bg-surface border border-line divide-y divide-line">
                    <li className="flex items-baseline justify-between gap-3 px-4 py-3.5">
                        <span className="text-body text-ink">SIPs each month</span>
                        <span className="text-body font-semibold text-ink num">{rupees(plan.sipMonthly)}</span>
                    </li>
                    <li className="flex items-baseline justify-between gap-3 px-4 py-3.5">
                        <span className="text-body text-ink">Portfolio today</span>
                        <span className="text-body font-semibold text-ink num">{rupees(plan.portfolioValue)}</span>
                    </li>
                </ul>
            </section>

            {mix.length > 0 && (
                <section aria-label="Where your money is now">
                    <SectionHeader title="Where your money is now" />
                    <div className="rounded-card bg-surface border border-line">
                        <div className="p-4 pb-3">
                            <div className="flex h-2 gap-0.5 rounded-full overflow-hidden" aria-hidden>
                                {mix.map((m, i) => (
                                    <div key={m.type} style={{ width: `${m.percent}%`, background: SERIES[i % SERIES.length], minWidth: 3 }} />
                                ))}
                            </div>
                        </div>
                        <ul className="divide-y divide-line border-t border-line">
                            {mix.map((m, i) => (
                                <li key={m.type} className="flex items-center gap-3 px-4 py-3">
                                    <span aria-hidden className="shrink-0 w-2.5 h-2.5 rounded-full" style={{ background: SERIES[i % SERIES.length] }} />
                                    <span className="flex-1 text-body text-ink">{m.type}</span>
                                    <span className="text-small text-ink-3 num">{m.percent}%</span>
                                    <span className="w-28 text-right text-body font-semibold text-ink num">{rupees(m.value)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>
            )}

            <p className="px-1 text-caption text-ink-3 leading-5">
                These are your own numbers added up. FinTwin isn't a SEBI-registered investment adviser and
                doesn't tell you what to buy or sell, or how to split your money.
            </p>
        </div>
    );
}
