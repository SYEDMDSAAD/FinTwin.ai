import { AlertTriangle, CheckCircle2, ChevronRight, Info, Target, TrendingUp, Gauge } from "lucide-react";
import { rupees } from "../utils/money";
import { headline, attentionItems } from "../utils/home";
import { Card, SectionHeader, Stat, Button, cx } from "./ui";
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
    danger: { cls: "text-bad", Icon: AlertTriangle },
    warning: { cls: "text-warn", Icon: AlertTriangle },
    success: { cls: "text-good", Icon: CheckCircle2 },
    info: { cls: "text-info", Icon: Info },
};

function Tile({ icon: Icon, label, value, note, onClick }) {
    return (
        <Card onClick={onClick} className="min-w-0">
            <Stat
                label={<span className="inline-flex items-center gap-1.5"><Icon size={14} aria-hidden className="text-accent" /> {label}</span>}
                value={value}
                note={note}
            />
        </Card>
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
    const barTone = head.share >= 1 ? "bg-bad" : head.share >= 0.8 ? "bg-warn" : "bg-accent";

    return (
        <div className="max-w-5xl grid gap-4 lg:grid-cols-2">
            {/* The number */}
            <Card pad="lg" aria-label={head.label}>
                {loading ? (
                    <>
                        <p className="text-caption font-medium text-ink-2">{head.label}</p>
                        <div className="h-10 w-48 mt-2 rounded-control animate-pulse bg-accent-soft" />
                    </>
                ) : (
                    <Stat size="lg" label={head.label} value={rupees(head.value)} tone={negative ? "bad" : undefined} />
                )}
                <p className="mt-1 text-small text-ink-3">{head.note}</p>

                {head.share != null && (
                    <div className="mt-4 h-2 rounded-full overflow-hidden bg-accent-soft" aria-hidden>
                        <div className={cx("h-full rounded-full transition-all", barTone)}
                             style={{ width: `${Math.round(head.share * 100)}%` }} />
                    </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-small text-ink-2">
                    <span>In <b className="text-ink">{rupees(income)}</b></span>
                    <span>Out <b className="text-ink">{rupees(spent)}</b></span>
                    <Button variant="ghost" size="sm" className="ml-auto -mr-2" onClick={() => navigateTo("Analytics")}>
                        Details <ChevronRight size={14} aria-hidden />
                    </Button>
                </div>
            </Card>

            {/* What needs you */}
            <Card pad="sm" aria-label="Needs your attention">
                <SectionHeader
                    className="px-2 pt-1 mb-1 items-center"
                    title="Needs your attention"
                    action={notifications.length > 0 && (
                        <Button variant="ghost" size="sm" onClick={() => navigateTo("AI Intelligence")}>See all</Button>
                    )}
                />
                {items.length === 0 ? (
                    <p className="flex items-center gap-2 px-2 py-3 text-small text-ink-2">
                        <CheckCircle2 size={16} aria-hidden className="text-good" /> Nothing needs you right now
                    </p>
                ) : (
                    <ul>
                        {items.map((it, i) => {
                            const { cls, Icon } = TONE[it.tone] || TONE.info;
                            return (
                                <li key={i}>
                                    <button type="button" onClick={() => navigateTo(it.to)}
                                            className="w-full flex items-start gap-3 px-2 py-2.5 rounded-control text-left hover:bg-accent-soft">
                                        <Icon size={16} aria-hidden className={cx("shrink-0 mt-0.5", cls)} />
                                        <span className="flex-1 text-small text-ink">{it.text}</span>
                                        <ChevronRight size={15} aria-hidden className="shrink-0 mt-0.5 text-ink-3" />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Card>

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
