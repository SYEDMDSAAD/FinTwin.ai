import { AlertTriangle, CheckCircle2, ChevronRight, Info, Target, TrendingUp, Gauge } from "lucide-react";
import { rupees, GOOD, BAD } from "../utils/money";
import { headline, attentionItems } from "../utils/home";
import SpendGuardCard from "./SpendGuardCard";

/*
 * Home: one number, what needs you, and a way into the rest.
 *
 * The number is what's left of this month's money: what came in minus what
 * went out (transfers between your own accounts already left out by the
 * backend). With no income on record yet it falls back to what's left in
 * your budgets, and with neither it shows what you've spent.
 */

const TONE = {
    danger: { color: BAD, Icon: AlertTriangle },
    warning: { color: "#fbbf24", Icon: AlertTriangle },
    success: { color: GOOD, Icon: CheckCircle2 },
    info: { color: "#22d3ee", Icon: Info },
};

const card = "rounded-2xl border";
const cardStyle = { background: "var(--bg-card)", borderColor: "var(--border-card)" };

function Tile({ icon: Icon, label, value, note, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`${card} p-4 text-left flex flex-col gap-1 hover:border-violet-400/50 transition-colors min-w-0`}
            style={cardStyle}
        >
            <span className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
                <Icon size={14} aria-hidden className="text-violet-500" /> {label}
            </span>
            <span className="text-[19px] font-bold tracking-tight truncate" style={{ color: "var(--text-primary)" }}>{value}</span>
            {note && <span className="text-[12px] truncate" style={{ color: "var(--text-dim)" }}>{note}</span>}
        </button>
    );
}

export default function HomeOverview({
    income = 0,
    spent = 0,
    budgets = [],
    notifications = [],
    goals = [],
    scoreData,
    netWorth,
    loading,
    navigateTo,
}) {
    const head = headline({ income, spent, budgets });
    const items = attentionItems({ budgets, notifications });
    const negative = head.kind !== "spent" && head.value < 0;
    const active = goals.filter((g) => !g.completed);
    const topGoal = [...active]
        .sort((a, b) => (b.progressPercent || 0) - (a.progressPercent || 0))[0];

    return (
        <div className="max-w-5xl grid gap-4 lg:grid-cols-2">
            {/* The number */}
            <section className={`${card} p-5 md:p-6`} style={cardStyle} aria-label={head.label}>
                <p className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>{head.label}</p>
                {loading ? (
                    <div className="h-10 w-48 mt-2 rounded-lg animate-pulse bg-violet-500/10" />
                ) : (
                    <p className="mt-1 text-[36px] md:text-[42px] font-bold tracking-tight leading-tight"
                       style={{ color: negative ? BAD : "var(--text-primary)" }}>
                        {rupees(head.value)}
                    </p>
                )}
                <p className="mt-1 text-[13px]" style={{ color: "var(--text-dim)" }}>{head.note}</p>

                {head.share != null && (
                    <div className="mt-4 h-2 rounded-full overflow-hidden bg-violet-500/10" aria-hidden>
                        <div className="h-full rounded-full transition-all"
                             style={{ width: `${Math.round(head.share * 100)}%`, background: head.share >= 1 ? BAD : head.share >= 0.8 ? "#fbbf24" : "#8b5cf6" }} />
                    </div>
                )}

                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                    <span>In <b style={{ color: "var(--text-primary)" }}>{rupees(income)}</b></span>
                    <span>Out <b style={{ color: "var(--text-primary)" }}>{rupees(spent)}</b></span>
                    <button type="button" onClick={() => navigateTo("Analytics")}
                            className="ml-auto inline-flex items-center gap-0.5 font-medium text-violet-500">
                        Details <ChevronRight size={14} aria-hidden />
                    </button>
                </div>
            </section>

            {/* What needs you */}
            <section className={`${card} p-2`} style={cardStyle} aria-label="Needs your attention">
                <div className="flex items-center justify-between px-3 pt-2 pb-1">
                    <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Needs your attention</h2>
                    {notifications.length > 0 && (
                        <button type="button" onClick={() => navigateTo("AI Intelligence")} className="text-[13px] font-medium text-violet-500">
                            See all
                        </button>
                    )}
                </div>
                {items.length === 0 ? (
                    <p className="flex items-center gap-2 px-3 py-3 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                        <CheckCircle2 size={16} aria-hidden style={{ color: GOOD }} /> Nothing needs you right now
                    </p>
                ) : (
                    <ul>
                        {items.map((it, i) => {
                            const { color, Icon } = TONE[it.tone] || TONE.info;
                            return (
                                <li key={i}>
                                    <button type="button" onClick={() => navigateTo(it.to)}
                                            className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-violet-500/[0.06]">
                                        <Icon size={16} aria-hidden className="shrink-0 mt-0.5" style={{ color }} />
                                        <span className="flex-1 text-[13px] leading-snug" style={{ color: "var(--text-primary)" }}>{it.text}</span>
                                        <ChevronRight size={15} aria-hidden className="shrink-0 mt-0.5" style={{ color: "var(--text-dim)" }} />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            <div className="lg:col-span-2 empty:hidden [&>*]:mb-0">
                <SpendGuardCard onOpen={() => navigateTo("Spend Guard")} />
            </div>

            {/* The rest, one tap away */}
            <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
                <Tile icon={Gauge} label="Health score"
                      value={scoreData?.score != null ? `${scoreData.score}/100` : "—"}
                      note="What's behind it" onClick={() => navigateTo("AI Intelligence")} />
                <Tile icon={Target} label="Goals"
                      value={active.length ? `${active.length} active` : "None yet"}
                      note={topGoal ? `${topGoal.title}: ${Math.round(topGoal.progressPercent || 0)}%` : "Set one"}
                      onClick={() => navigateTo("Goals Planner")} />
                <Tile icon={TrendingUp} label="Net worth"
                      value={netWorth?.netWorth != null ? rupees(netWorth.netWorth) : "—"}
                      note="Assets minus loans" onClick={() => navigateTo("Net Worth")} />
            </div>
        </div>
    );
}
