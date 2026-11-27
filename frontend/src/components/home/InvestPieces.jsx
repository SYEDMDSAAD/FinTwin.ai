import { ResponsiveContainer, AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { CalendarClock, PiggyBank, FileUp, Plus, AlertTriangle, Info, Sparkles, ChevronRight, TrendingUp } from "lucide-react";
import { rupees } from "../../utils/money";
import { allocation, assetClassOf, CLASS_COLORS, sipSummary, sortHoldings, spareThisMonth, topMovers } from "../../utils/portfolio";
import { Button, cx } from "../ui";
import { ChartTooltip } from "../ui/charts";
import { xAxis, yAxis, grid } from "../ui/chartTheme";

/*
 * Home's investing pieces. FinTwin is an investing app first, so Home opens
 * on the portfolio; the same pieces are laid out for a phone (HomeOverview)
 * and a computer (HomeDesk).
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (ym) => {
    const [y, m] = String(ym).split("-");
    return `${MONTHS[Number(m) - 1]} ${String(y).slice(2)}`;
};
const signed = (n) => `${n >= 0 ? "+" : "−"}${rupees(Math.abs(n))}`;
const shortDate = (iso) => {
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

/** The portfolio's number, its returns and (with three months of history) value over time. */
export function PortfolioHero({ portfolio, history, loading, navigateTo, chartHeight = 150, framed = false, topHoldings = 0 }) {
    const holdings = portfolio?.holdings || [];
    const value = Number(portfolio?.currentValue) || 0;
    const pnl = Number(portfolio?.totalPnl) || 0;
    const points = (history?.months || []).map((p) => ({ ...p, label: monthLabel(p.month) }));
    const Wrap = framed ? "section" : "section";

    if (!loading && holdings.length === 0) {
        return (
            <Wrap aria-label="Your investments" className={cx(framed && "rounded-card bg-surface border border-line p-6")}>
                <span className="w-11 h-11 rounded-full bg-accent-soft text-accent flex items-center justify-center"><TrendingUp size={20} aria-hidden /></span>
                <h2 className="mt-4 text-[22px] leading-tight font-[650] tracking-[-0.02em] text-ink">Start with what you already own</h2>
                <p className="mt-2 text-body text-ink-2 max-w-md">
                    Import your mutual-fund statement (CAS) once and FinTwin shows every fund, what it's worth today and your real yearly return.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                    <Button icon={FileUp} onClick={() => navigateTo("Investments")}>Import your CAS</Button>
                    <Button variant="secondary" icon={Plus} onClick={() => navigateTo("Investments")}>Add an investment</Button>
                </div>
            </Wrap>
        );
    }

    return (
        <Wrap aria-label="Portfolio value" className={cx(framed && "rounded-card bg-surface border border-line p-6")}>
            <div className="flex items-start justify-between gap-3">
                <p className="text-small font-medium text-ink-3">Portfolio value</p>
                <button type="button" onClick={() => navigateTo("Investments")}
                        className="text-small font-medium text-accent inline-flex items-center gap-0.5 -mr-1">
                    Holdings <ChevronRight size={15} aria-hidden />
                </button>
            </div>
            {loading ? (
                <div className="h-12 w-56 mt-2 rounded-control animate-pulse bg-surface-sunken" />
            ) : (
                <p className="text-hero text-ink num mt-1">{rupees(value)}</p>
            )}
            {!loading && (
                <p className="mt-2 text-body text-ink-2">
                    <span className={cx("font-semibold num", pnl >= 0 ? "text-good" : "text-bad")}>
                        {signed(pnl)} ({pnl >= 0 ? "+" : ""}{portfolio?.totalPnlPercent ?? 0}%)
                    </span>
                    {" "}on {rupees(portfolio?.totalInvested || 0)} put in
                </p>
            )}
            {portfolio?.xirr != null && (
                <p className="mt-1 text-small text-ink-3 num">{portfolio.xirr}% a year (XIRR), counting when each rupee went in</p>
            )}
            {points.length >= 3 && (
                <div className="mt-5 -ml-2" style={{ height: chartHeight }}>
                    <ResponsiveContainer initialDimension={{ width: 320, height: chartHeight }} width="100%" height="100%">
                        <AreaChart data={points} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="ph-fill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid {...grid} />
                            <XAxis {...xAxis} dataKey="label" />
                            <YAxis {...yAxis} />
                            <Tooltip content={<ChartTooltip />} />
                            <Area type="monotone" dataKey="value" name="Worth" stroke="var(--accent)" strokeWidth={2.2} fill="url(#ph-fill)" />
                            <Line type="stepAfter" dataKey="invested" name="Put in" stroke="var(--text-dim)" strokeDasharray="4 3" dot={false} strokeWidth={1.5} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
            {topHoldings > 0 && holdings.length > 0 && (
                <HoldingsPeek holdings={holdings} limit={points.length >= 3 ? Math.min(3, topHoldings) : topHoldings} navigateTo={navigateTo} />
            )}
        </Wrap>
    );
}

/** The biggest holdings, each with its value and return, like a broker's holdings card. */
function HoldingsPeek({ holdings, limit, navigateTo }) {
    const top = sortHoldings(holdings, "value").slice(0, limit);
    const total = holdings.reduce((t, h) => t + (Number(h.currentValue) || 0), 0) || 1;
    return (
        <div className="mt-5 pt-4 border-t border-line">
            <div className="flex items-center justify-between text-caption text-ink-3 mb-1">
                <span>Biggest holdings</span><span>Value · return</span>
            </div>
            <ul className="divide-y divide-line">
                {top.map((h) => {
                    const pos = (Number(h.pnl) || 0) >= 0;
                    return (
                        <li key={h.id}>
                            <button type="button" onClick={() => navigateTo("Investments")} className="w-full flex items-center gap-3 py-2.5 text-left">
                                <span className="w-1.5 h-8 rounded-full shrink-0" style={{ background: CLASS_COLORS[assetClassOf(h)] }} aria-hidden />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-body text-ink truncate">{h.name}</span>
                                    <span className="block text-caption text-ink-3 num">{h.type} · {Math.round(((Number(h.currentValue) || 0) / total) * 100)}% of portfolio</span>
                                </span>
                                <span className="text-right shrink-0">
                                    <span className="block text-body font-medium text-ink num">{rupees(h.currentValue || 0)}</span>
                                    <span className={cx("block text-caption num", pos ? "text-good" : "text-bad")}>
                                        {pos ? "+" : ""}{h.pnlPercent ?? 0}%{h.xirr != null ? ` · ${h.xirr}% a yr` : ""}
                                    </span>
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/** Where the money sits: equity, debt, hybrid, gold. */
export function AllocationCard({ holdings = [], navigateTo, donut = false }) {
    const rows = allocation(holdings);
    if (rows.length === 0) return null;
    return (
        <section aria-label="Allocation" className="rounded-card bg-surface border border-line p-5">
            <div className="flex items-center justify-between">
                <h2 className="text-body font-semibold text-ink">Where it sits</h2>
                <button type="button" onClick={() => navigateTo("Investment Insights")} className="text-small font-medium text-accent">Insights</button>
            </div>
            {donut ? <Donut rows={rows} /> : (
                <div className="mt-3 flex h-2.5 gap-0.5 rounded-full overflow-hidden" aria-hidden>
                    {rows.map((r) => <div key={r.name} style={{ width: `${r.pct}%`, minWidth: 3, background: CLASS_COLORS[r.name] }} />)}
                </div>
            )}
            <ul className={cx("mt-3", donut ? "space-y-1.5" : "flex flex-wrap gap-x-4 gap-y-1.5")}>
                {rows.map((r) => (
                    <li key={r.name} className="flex items-center gap-2 text-small text-ink-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CLASS_COLORS[r.name] }} />
                        <span className={donut ? "flex-1" : ""}>{r.name}</span>
                        <span className="text-ink num font-medium">{r.pct}%</span>
                        {donut && <span className="text-ink-3 num w-20 text-right">{rupees(r.value)}</span>}
                    </li>
                ))}
            </ul>
        </section>
    );
}

function Donut({ rows }) {
    const r = 42, c = 2 * Math.PI * r;
    const arcs = rows.map((x, i) => ({
        ...x,
        len: (x.pct / 100) * c,
        start: rows.slice(0, i).reduce((t, y) => t + (y.pct / 100) * c, 0),
    }));
    return (
        <svg viewBox="0 0 110 110" className="w-28 h-28 mx-auto mt-3" role="img"
             aria-label={rows.map((x) => `${x.name} ${x.pct}%`).join(", ")}>
            <circle cx="55" cy="55" r={r} fill="none" stroke="var(--bg-input)" strokeWidth="14" />
            {arcs.map((x) => (
                <circle key={x.name} cx="55" cy="55" r={r} fill="none" stroke={CLASS_COLORS[x.name]} strokeWidth="14"
                        strokeDasharray={`${Math.max(0, x.len - 1.5)} ${c}`} strokeDashoffset={-x.start}
                        transform="rotate(-90 55 55)" />
            ))}
        </svg>
    );
}

/** Money in minus money out this month: what could still be invested. */
export function SpareCard({ income, spent, navigateTo }) {
    const { spare, over } = spareThisMonth(income, spent);
    return (
        <button type="button" onClick={() => navigateTo(over ? "Budgeting" : "Future Twin")}
                className="w-full rounded-card bg-surface border border-line p-5 text-left transition hover:border-line-strong">
            <span className="flex items-center gap-2 text-small text-ink-3">
                <PiggyBank size={16} aria-hidden className={over ? "text-bad" : "text-good"} /> Spare this month
            </span>
            <span className={cx("block mt-1.5 text-[22px] leading-tight font-[650] tracking-[-0.02em] num", over ? "text-bad" : "text-ink")}>
                {over ? `−${rupees(over)}` : rupees(spare)}
            </span>
            <span className="block mt-1 text-small text-ink-3">
                {over ? "Spending ran past income, so nothing is spare yet" : "Money in minus money out, free to invest"}
            </span>
        </button>
    );
}

/** SIPs: the monthly total and the next one due. */
export function SipCard({ sips = [], navigateTo }) {
    const s = sipSummary(sips);
    return (
        <button type="button" onClick={() => navigateTo("SIPs")}
                className="w-full rounded-card bg-surface border border-line p-5 text-left transition hover:border-line-strong">
            <span className="flex items-center gap-2 text-small text-ink-3">
                <CalendarClock size={16} aria-hidden className="text-accent" /> SIPs
            </span>
            {s.count === 0 ? (
                <>
                    <span className="block mt-1.5 text-[22px] leading-tight font-[650] tracking-[-0.02em] text-ink">None yet</span>
                    <span className="block mt-1 text-small text-ink-3">Add the SIPs you run to see each debit coming</span>
                </>
            ) : (
                <>
                    <span className="block mt-1.5 text-[22px] leading-tight font-[650] tracking-[-0.02em] text-ink num">
                        {rupees(s.monthly)}<span className="text-small font-normal text-ink-3"> a month</span>
                    </span>
                    <span className="block mt-1 text-small text-ink-3 truncate">
                        {s.next ? `Next: ${s.next.fundName} on ${shortDate(s.next.nextDebitDate)}` : `${s.count} running`}
                    </span>
                </>
            )}
        </button>
    );
}

const INSIGHT_TONE = { warn: { Icon: AlertTriangle, cls: "text-warn bg-warn-soft" }, info: { Icon: Info, cls: "text-info bg-info-soft" }, good: { Icon: Sparkles, cls: "text-good bg-good-soft" } };

/** The health check's first finding, one tap from the rest. */
export function TopInsight({ health, navigateTo }) {
    const first = health?.checks?.[0];
    if (!first) return null;
    const { Icon, cls } = INSIGHT_TONE[first.tone] || INSIGHT_TONE.info;
    const more = (health.checks.length || 1) - 1;
    return (
        <button type="button" onClick={() => navigateTo("Investment Insights")}
                className="w-full rounded-card bg-surface border border-line p-4 text-left flex items-start gap-3 transition hover:border-line-strong">
            <span className={cx("w-9 h-9 rounded-full flex items-center justify-center shrink-0", cls)}><Icon size={17} aria-hidden /></span>
            <span className="min-w-0 flex-1">
                <span className="block text-body text-ink">{first.title}</span>
                <span className="block text-small text-ink-3 mt-0.5 line-clamp-2">{first.detail}</span>
                {more > 0 && <span className="block text-small font-medium text-accent mt-1.5">{more} more {more === 1 ? "finding" : "findings"}</span>}
            </span>
            <ChevronRight size={18} aria-hidden className="shrink-0 text-ink-3 mt-2" />
        </button>
    );
}

function MoverRow({ h, label }) {
    const pos = (Number(h.pnl) || 0) >= 0;
    return (
        <li className="py-2.5">
            <p className="text-caption text-ink-3">{label}</p>
            <div className="flex items-baseline justify-between gap-3 mt-0.5">
                <span className="text-body text-ink truncate">{h.name}</span>
                <span className={cx("text-body font-medium num shrink-0", pos ? "text-good" : "text-bad")}>{signed(Number(h.pnl) || 0)}</span>
            </div>
        </li>
    );
}

/** What added most to the total, and what held it back most. */
export function TopMovers({ holdings = [] }) {
    const { best, worst } = topMovers(holdings);
    if (!best && !worst) return null;
    return (
        <section aria-label="Top movers" className="rounded-card bg-surface border border-line px-5 py-3">
            <h2 className="text-body font-semibold text-ink pt-1">What moved the total</h2>
            <ul className="divide-y divide-line">
                {best && <MoverRow h={best} label="Added the most" />}
                {worst && <MoverRow h={worst} label="Held it back the most" />}
            </ul>
        </section>
    );
}
