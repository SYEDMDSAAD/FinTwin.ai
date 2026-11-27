import { AlertTriangle, AlertOctagon, CheckCircle2, Info, Target, TrendingUp, Gauge, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { rupees } from "../utils/money";
import { headline, attentionItems } from "../utils/home";
import { SectionHeader, Progress, List, ListRow, Button } from "./ui";
import SpendGuardCard from "./SpendGuardCard";
import HomeDesk from "./HomeDesk";
import useWide from "../hooks/useWide";

/*
 * Home: one number, what needs you, and a way into the rest.
 *
 * The number is what's left of this month's money: what came in minus what
 * went out (transfers between your own accounts already left out by the
 * backend). With no income on record yet it falls back to what's left in
 * your budgets, and with neither it shows what you've spent.
 */

const TONE = {
    danger: { tone: "bad", icon: AlertOctagon },
    warning: { tone: "warn", icon: AlertTriangle },
    success: { tone: "good", icon: CheckCircle2 },
    info: { tone: "info", icon: Info },
};

export default function HomeOverview({
    income = 0,
    spent = 0,
    budgets = [],
    notifications = [],
    goals = [],
    scoreData,
    netWorth,
    monthlyHistory,
    loading,
    navigateTo,
}) {
    const wide = useWide();
    const head = headline({ income, spent, budgets });
    const items = attentionItems({ budgets, notifications });
    const negative = head.kind !== "spent" && head.value < 0;
    const active = goals.filter((g) => !g.completed);
    const topGoal = [...active].sort((a, b) => (b.progressPercent || 0) - (a.progressPercent || 0))[0];
    const barTone = head.share >= 1 ? "bad" : head.share >= 0.8 ? "warn" : "accent";

    if (wide) {
        return (
            <HomeDesk head={head} items={items} negative={negative} barTone={barTone}
                      income={income} spent={spent} notifications={notifications}
                      active={active} topGoal={topGoal} scoreData={scoreData} netWorth={netWorth}
                      monthlyHistory={monthlyHistory} loading={loading} navigateTo={navigateTo} />
        );
    }

    return (
        <div className="max-w-2xl space-y-8">
            {/* The number: no box around it, it's the screen */}
            <section aria-label={head.label} className="px-1">
                <p className="text-small text-ink-3">{head.label}</p>
                {loading ? (
                    <div className="h-12 w-56 mt-2 rounded-control animate-pulse bg-surface-sunken" />
                ) : (
                    <p className={`text-hero num mt-1 ${negative ? "text-bad" : "text-ink"}`}>{rupees(head.value)}</p>
                )}
                <p className="mt-2 text-body text-ink-2">{head.note}</p>
                {head.share != null && <Progress className="mt-5" value={head.share * 100} tone={barTone} label="Share of this month's money spent" />}

                <div className="mt-5 grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => navigateTo("Analytics")}
                            className="flex items-center gap-3 rounded-card bg-surface border border-line px-4 py-3 text-left hover:bg-surface-hover">
                        <span className="w-8 h-8 rounded-full bg-good-soft text-good flex items-center justify-center"><ArrowDownLeft size={16} aria-hidden /></span>
                        <span className="min-w-0">
                            <span className="block text-small text-ink-3">Money in</span>
                            <span className="block text-body font-semibold text-ink num truncate">{rupees(income)}</span>
                        </span>
                    </button>
                    <button type="button" onClick={() => navigateTo("Analytics")}
                            className="flex items-center gap-3 rounded-card bg-surface border border-line px-4 py-3 text-left hover:bg-surface-hover">
                        <span className="w-8 h-8 rounded-full bg-surface-sunken text-ink-2 flex items-center justify-center"><ArrowUpRight size={16} aria-hidden /></span>
                        <span className="min-w-0">
                            <span className="block text-small text-ink-3">Money out</span>
                            <span className="block text-body font-semibold text-ink num truncate">{rupees(spent)}</span>
                        </span>
                    </button>
                </div>
            </section>

            {/* What needs you */}
            <section aria-label="Needs your attention">
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
                            <ListRow
                                key={i}
                                icon={t.icon}
                                tone={t.tone}
                                title={it.title}
                                subtitle={it.detail}
                                onClick={() => navigateTo(it.to)}
                                wrap={!it.detail}
                            />
                        );
                    })}
                </List>
            </section>

            <SpendGuardCard onOpen={() => navigateTo("Spend Guard")} />

            {/* The rest, one tap away */}
            <section aria-label="Your money">
                <SectionHeader title="Your money" />
                <List>
                    <ListRow icon={Gauge} title="Health score"
                             subtitle="What's behind it"
                             trailing={scoreData?.score != null ? `${scoreData.score}/100` : "—"}
                             onClick={() => navigateTo("AI Intelligence")} />
                    <ListRow icon={Target} title="Goals"
                             subtitle={topGoal ? `${topGoal.title} · ${Math.round(topGoal.progressPercent || 0)}% there` : "Set your first goal"}
                             trailing={active.length ? `${active.length} active` : null}
                             onClick={() => navigateTo("Goals Planner")} />
                    <ListRow icon={TrendingUp} title="Net worth"
                             subtitle="Owned minus owed"
                             trailing={netWorth?.netWorth != null ? rupees(netWorth.netWorth) : "—"}
                             onClick={() => navigateTo("Net Worth")} />
                </List>
            </section>
        </div>
    );
}
