import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import {
    ArrowDownLeft, ArrowUpRight, Gauge, TrendingUp, Target, CheckCircle2, ChevronRight,
    AlertOctagon, AlertTriangle, Info, Sparkles,
} from "lucide-react";
import { rupees } from "../utils/money";
import { SectionHeader, Progress, List, ListRow, Button } from "./ui";
import { ChartTooltip } from "./ui/charts";
import { xAxis, yAxis, grid } from "./ui/chartTheme";
import SpendGuardCard from "./SpendGuardCard";

/*
 * Home on a computer: the same facts as the phone's Home, laid out as a
 * dashboard: the month at a glance, the money moving over time, what needs
 * you and how the goals are doing, side by side.
 */

const TONE = {
    danger: { tone: "bad", icon: AlertOctagon },
    warning: { tone: "warn", icon: AlertTriangle },
    success: { tone: "good", icon: CheckCircle2 },
    info: { tone: "info", icon: Info },
};

const monthLabel = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleString("en-IN", { month: "short" });

function Tile({ icon: Icon, tone, label, value, note, onClick }) {
    const chip = {
        good: "bg-good-soft text-good",
        neutral: "bg-surface-sunken text-ink-2",
        accent: "bg-accent-soft text-accent",
        info: "bg-info-soft text-info",
    }[tone] || "bg-surface-sunken text-ink-2";
    return (
        <button
            type="button"
            onClick={onClick}
            className="group rounded-card bg-surface border border-line p-5 text-left transition hover:-translate-y-0.5 hover:border-line-strong"
        >
            <div className="flex items-center justify-between">
                <span className={`w-9 h-9 rounded-full flex items-center justify-center ${chip}`}><Icon size={17} aria-hidden /></span>
                <ChevronRight size={16} aria-hidden className="text-ink-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="mt-4 text-small text-ink-3">{label}</p>
            <p className="mt-0.5 text-[24px] leading-tight font-[650] tracking-[-0.02em] text-ink num truncate">{value}</p>
            {note && <p className="mt-1 text-small text-ink-3 truncate">{note}</p>}
        </button>
    );
}

export default function HomeDesk({
    head, items, negative, barTone, income, spent, notifications, active, topGoal,
    scoreData, netWorth, monthlyHistory = [], loading, navigateTo,
}) {
    const flow = (monthlyHistory || []).slice(-6).map((h) => ({
        month: monthLabel(h.month),
        spent: Math.abs(Number(h.expense ?? h.expenses) || 0),
    }));
    const goals = [...active].sort((a, b) => (b.progressPercent || 0) - (a.progressPercent || 0)).slice(0, 3);

    return (
        <div className="space-y-7">
            {/* The month at a glance */}
            <div className="grid grid-cols-12 gap-6">
                <section
                    aria-label={head.label}
                    className="col-span-5 rounded-card border border-line p-6 relative overflow-hidden bg-surface"
                >
                    <div aria-hidden className="absolute -right-16 -top-20 w-64 h-64 rounded-full opacity-60"
                         style={{ background: "radial-gradient(circle, var(--accent-soft), transparent 70%)" }} />
                    <p className="relative text-small font-medium text-ink-3">{head.label}</p>
                    {loading ? (
                        <div className="h-12 w-56 mt-2 rounded-control animate-pulse bg-surface-sunken" />
                    ) : (
                        <p className={`relative text-hero num mt-1 ${negative ? "text-bad" : "text-ink"}`}>{rupees(head.value)}</p>
                    )}
                    <p className="relative mt-2 text-body text-ink-2">{head.note}</p>
                    {head.share != null && (
                        <Progress className="relative mt-6" value={head.share * 100} tone={barTone} label="Share of this month's money spent" />
                    )}
                    <Button className="relative mt-6" variant="secondary" size="sm" onClick={() => navigateTo("Analytics")}>
                        See where it went
                    </Button>
                </section>

                <div className="col-span-7 grid grid-cols-2 gap-6">
                    <Tile icon={ArrowDownLeft} tone="good" label="Money in" value={rupees(income)} note="This month" onClick={() => navigateTo("Analytics")} />
                    <Tile icon={ArrowUpRight} tone="neutral" label="Money out" value={rupees(spent)} note="This month" onClick={() => navigateTo("Transactions")} />
                    <Tile icon={TrendingUp} tone="info" label="Net worth" value={netWorth?.netWorth != null ? rupees(netWorth.netWorth) : "—"} note="Owned minus owed" onClick={() => navigateTo("Net Worth")} />
                    <Tile icon={Gauge} tone="accent" label="Health score" value={scoreData?.score != null ? `${scoreData.score}/100` : "—"} note="What's behind it" onClick={() => navigateTo("AI Intelligence")} />
                </div>
            </div>

            {/* Money over time, and the goals */}
            <div className="grid grid-cols-12 gap-6">
                <section aria-label="Spending by month" className="col-span-8 rounded-card bg-surface border border-line p-6">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-[18px] leading-tight font-[650] tracking-[-0.015em] text-ink">Spending by month</h2>
                            <p className="text-small text-ink-3 mt-0.5">Last {flow.length || 6} months, transfers between your own accounts left out</p>
                        </div>
                        <Button variant="ghost" size="sm" className="-mr-2" onClick={() => navigateTo("Analytics")}>Analytics</Button>
                    </div>
                    {flow.length >= 2 ? (
                        <div className="h-[240px] mt-4 -ml-2">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={flow} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="hd-out" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                                            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid {...grid} />
                                    <XAxis {...xAxis} dataKey="month" />
                                    <YAxis {...yAxis} />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Area type="monotone" name="Spent" dataKey="spent" stroke="var(--accent)" strokeWidth={2.4} fill="url(#hd-out)"
                                          dot={{ r: 3.5, fill: "var(--bg-card)", stroke: "var(--accent)", strokeWidth: 2 }} activeDot={{ r: 5 }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <p className="mt-10 mb-8 text-center text-small text-ink-3">A chart appears here once there are two months of transactions.</p>
                    )}
                </section>

                <section aria-label="Goals" className="col-span-4 rounded-card bg-surface border border-line p-6 flex flex-col">
                    <div className="flex items-center justify-between">
                        <h2 className="text-[18px] leading-tight font-[650] tracking-[-0.015em] text-ink">Goals</h2>
                        <Button variant="ghost" size="sm" className="-mr-2" onClick={() => navigateTo("Goals Planner")}>All goals</Button>
                    </div>
                    {goals.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
                            <span className="w-11 h-11 rounded-full bg-accent-soft text-accent flex items-center justify-center"><Target size={20} aria-hidden /></span>
                            <p className="mt-3 text-body text-ink">No goals yet</p>
                            <Button className="mt-3" size="sm" onClick={() => navigateTo("Goals Planner")}>Set a goal</Button>
                        </div>
                    ) : (
                        <ul className="mt-4 space-y-5">
                            {goals.map((g) => {
                                const pct = Math.max(0, Math.min(100, Math.round(g.progressPercent || 0)));
                                return (
                                    <li key={g.id ?? g.title}>
                                        <div className="flex items-baseline justify-between gap-3">
                                            <span className="text-body text-ink truncate">{g.title}</span>
                                            <span className="text-small text-ink-3 num shrink-0">{pct}%</span>
                                        </div>
                                        <Progress className="mt-2" value={pct} tone={pct >= 100 ? "good" : "accent"} label={`${g.title} progress`} />
                                        {g.targetAmount != null && (
                                            <p className="mt-1.5 text-caption text-ink-3 num">{rupees(g.currentAmount || 0)} of {rupees(g.targetAmount)}</p>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {topGoal && active.length > goals.length && (
                        <p className="mt-auto pt-4 text-small text-ink-3">+{active.length - goals.length} more</p>
                    )}
                </section>
            </div>

            {/* What needs you, and the guard */}
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
                            <span className="block text-small text-ink-3">“Where did most of my money go last month?”</span>
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
}
