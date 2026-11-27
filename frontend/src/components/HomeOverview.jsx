import { AlertTriangle, AlertOctagon, CheckCircle2, Info, Target, TrendingUp, Gauge, Wallet } from "lucide-react";
import { rupees } from "../utils/money";
import { headline, attentionItems } from "../utils/home";
import { SectionHeader, List, ListRow, Button } from "./ui";
import useInvestData from "../hooks/useInvestData";
import { PortfolioHero, SpareCard, SipCard, AllocationCard, TopInsight } from "./home/InvestPieces";
import SpendGuardCard from "./SpendGuardCard";
import InvestPot from "./home/InvestPot";
import HomeDesk from "./HomeDesk";
import useWide from "../hooks/useWide";

/*
 * Home: FinTwin is an investing app first, so Home opens on the portfolio —
 * its value, what's spare to invest this month, the SIPs and where the money
 * sits — then what needs you, and a way into the rest.
 *
 * "Left this month" is still here, as a row:
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
    loading,
    navigateTo,
}) {
    const wide = useWide();
    const invest = useInvestData();
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
                      invest={invest} loading={loading} navigateTo={navigateTo} />
        );
    }

    return (
        <div className="max-w-2xl space-y-6">
            <div className="px-1">
                <PortfolioHero portfolio={invest.portfolio} history={invest.history} loading={invest.loading} navigateTo={navigateTo} topHoldings={3} />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <SpareCard income={income} spent={spent} navigateTo={navigateTo} />
                <SipCard sips={invest.sips} navigateTo={navigateTo} />
            </div>

            <InvestPot />
            <AllocationCard holdings={invest.portfolio?.holdings} navigateTo={navigateTo} />
            <TopInsight health={invest.health} navigateTo={navigateTo} />

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
                    <ListRow icon={Wallet} tone={negative ? "bad" : undefined} title={head.label}
                             subtitle={head.note}
                             trailing={loading ? "—" : rupees(head.value)}
                             onClick={() => navigateTo("Analytics")} />
                    <ListRow icon={Target} title="Goals"
                             subtitle={topGoal ? `${topGoal.title} · ${Math.round(topGoal.progressPercent || 0)}% there` : "Set your first goal"}
                             trailing={active.length ? `${active.length} active` : null}
                             onClick={() => navigateTo("Goals Planner")} />
                    <ListRow icon={TrendingUp} title="Net worth"
                             subtitle="Owned minus owed"
                             trailing={netWorth?.netWorth != null ? rupees(netWorth.netWorth) : "—"}
                             onClick={() => navigateTo("Net Worth")} />
                    <ListRow icon={Gauge} title="Health score"
                             subtitle="What's behind it"
                             trailing={scoreData?.score != null ? `${scoreData.score}/100` : "—"}
                             onClick={() => navigateTo("AI Intelligence")} />
                </List>
            </section>
        </div>
    );
}
