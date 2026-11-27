import {
    Target, CheckCircle2, AlertOctagon, AlertTriangle, Info, Sparkles, ArrowDownLeft, ArrowUpRight,
} from "lucide-react";
import { rupees } from "../utils/money";
import { SectionHeader, Progress, List, ListRow, Button } from "./ui";
import SpendGuardCard from "./SpendGuardCard";
import InvestPot from "./home/InvestPot";
import { PortfolioHero, SpareCard, SipCard, AllocationCard, TopInsight } from "./home/InvestPieces";

/*
 * Home on a computer: the same facts as the phone's Home, as a dashboard.
 * Investing leads — the portfolio and its value over time, what's spare to
 * invest and the SIPs — then where the money sits, the goals, this month's
 * spending, and what needs you.
 */

const TONE = {
    danger: { tone: "bad", icon: AlertOctagon },
    warning: { tone: "warn", icon: AlertTriangle },
    success: { tone: "good", icon: CheckCircle2 },
    info: { tone: "info", icon: Info },
};

export default function HomeDesk({
    head, items, negative, barTone, income, spent, notifications, active,
    invest = {}, loading, navigateTo,
}) {
    const goals = [...active].sort((a, b) => (b.progressPercent || 0) - (a.progressPercent || 0)).slice(0, 3);

    return (
        <div className="space-y-6">
            {/* Investing first */}
            <div className="grid grid-cols-12 gap-6 items-stretch">
                <div className="col-span-8">
                    <PortfolioHero framed portfolio={invest.portfolio} history={invest.history}
                                   loading={invest.loading} navigateTo={navigateTo} chartHeight={200} topHoldings={4} />
                </div>
                <div className="col-span-4 flex flex-col gap-6">
                    <SpareCard income={income} spent={spent} navigateTo={navigateTo} />
                    <SipCard sips={invest.sips} navigateTo={navigateTo} />
                    <TopInsight health={invest.health} navigateTo={navigateTo} />
                </div>
            </div>

            <div className="grid grid-cols-12 gap-6 items-start">
                <div className="col-span-4">
                    <AllocationCard donut holdings={invest.portfolio?.holdings} navigateTo={navigateTo} />
                </div>

                <section aria-label="Goals" className="col-span-4 rounded-card bg-surface border border-line p-5">
                    <div className="flex items-center justify-between">
                        <h2 className="text-body font-semibold text-ink">Goals</h2>
                        <Button variant="ghost" size="sm" className="-mr-2" onClick={() => navigateTo("Goals Planner")}>All goals</Button>
                    </div>
                    {goals.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-center py-6">
                            <span className="w-11 h-11 rounded-full bg-accent-soft text-accent flex items-center justify-center"><Target size={20} aria-hidden /></span>
                            <p className="mt-3 text-body text-ink">No goals yet</p>
                            <Button className="mt-3" size="sm" onClick={() => navigateTo("Goals Planner")}>Set a goal</Button>
                        </div>
                    ) : (
                        <ul className="mt-3 space-y-4">
                            {goals.map((g) => {
                                const pct = Math.max(0, Math.min(100, Math.round(g.progressPercent || 0)));
                                return (
                                    <li key={g.id ?? g.title}>
                                        <div className="flex items-baseline justify-between gap-3">
                                            <span className="text-body text-ink truncate">{g.title}</span>
                                            <span className="text-small text-ink-3 num shrink-0">{pct}%</span>
                                        </div>
                                        <Progress className="mt-2" value={pct} tone={pct >= 100 ? "good" : "accent"} label={`${g.title} progress`} />
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {active.length > goals.length && <p className="mt-4 text-small text-ink-3">+{active.length - goals.length} more</p>}
                </section>

                {/* This month's spending, small: it feeds the investing above */}
                <section aria-label={head.label} className="col-span-4 rounded-card bg-surface border border-line p-5">
                    <div className="flex items-center justify-between">
                        <h2 className="text-body font-semibold text-ink">This month</h2>
                        <Button variant="ghost" size="sm" className="-mr-2" onClick={() => navigateTo("Analytics")}>Analytics</Button>
                    </div>
                    <p className="mt-2 text-small text-ink-3">{head.label}</p>
                    {loading ? (
                        <div className="h-8 w-40 mt-1 rounded-control animate-pulse bg-surface-sunken" />
                    ) : (
                        <p className={`text-[26px] leading-tight font-[650] tracking-[-0.02em] num mt-0.5 ${negative ? "text-bad" : "text-ink"}`}>{rupees(head.value)}</p>
                    )}
                    {head.share != null && <Progress className="mt-3" value={head.share * 100} tone={barTone} label="Share of this month's money spent" />}
                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <button type="button" onClick={() => navigateTo("Analytics")} className="text-left">
                            <span className="flex items-center gap-1.5 text-small text-ink-3"><ArrowDownLeft size={14} aria-hidden className="text-good" />Money in</span>
                            <span className="block text-body font-semibold text-ink num mt-0.5">{rupees(income)}</span>
                        </button>
                        <button type="button" onClick={() => navigateTo("Transactions")} className="text-left">
                            <span className="flex items-center gap-1.5 text-small text-ink-3"><ArrowUpRight size={14} aria-hidden />Money out</span>
                            <span className="block text-body font-semibold text-ink num mt-0.5">{rupees(spent)}</span>
                        </button>
                    </div>
                </section>
            </div>

            {/* What needs you, and the guard that finds money to invest */}
            <div className="grid grid-cols-12 gap-6 items-start">
                <section aria-label="Needs your attention" className="col-span-7">
                    <SectionHeader
                        title="Needs your attention"
                        action={notifications.length > 0 && (
                            <Button variant="ghost" size="sm" className="-mr-2" onClick={() => navigateTo("AI Intelligence")}>See all</Button>
                        )}
                    />
                    <List>
                        {items.length === 0 ? (
                            <ListRow icon={CheckCircle2} tone="good" title="You're on track" subtitle="Nothing needs you right now" />
                        ) : items.map((it, i) => {
                            const t = TONE[it.tone] || TONE.info;
                            return (
                                <ListRow key={i} icon={t.icon} tone={t.tone} title={it.title} subtitle={it.detail}
                                         onClick={() => navigateTo(it.to)} wrap={!it.detail} />
                            );
                        })}
                    </List>
                </section>
                <div className="col-span-5 space-y-6">
                    <InvestPot />
                    <SpendGuardCard onOpen={() => navigateTo("Spend Guard")} />
                    <button
                        type="button"
                        onClick={() => navigateTo("AI Copilot")}
                        className="w-full rounded-card border border-line p-5 text-left flex items-center gap-4 transition hover:-translate-y-0.5"
                        style={{ background: "linear-gradient(135deg, var(--accent-soft), var(--bg-card))" }}
                    >
                        <span className="w-10 h-10 rounded-full bg-accent-strong text-accent-on flex items-center justify-center shrink-0">
                            <Sparkles size={18} aria-hidden />
                        </span>
                        <span className="min-w-0">
                            <span className="block text-body font-semibold text-ink">Ask Copilot</span>
                            <span className="block text-small text-ink-3">“How have my funds done this year?”</span>
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
}
