import { useEffect, useState } from "react";

function CircleScore({ score }) {
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const t = setTimeout(() => setProgress(score), 300);
        return () => clearTimeout(t);
    }, [score]);

    const dash = circumference * (progress / 100);

    return (
        <svg width="140" height="140" className="-rotate-90">
            <circle cx="70" cy="70" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
            <circle cx="70" cy="70" r={radius} fill="none" stroke="url(#scoreGrad)" strokeWidth="10"
                strokeLinecap="round" strokeDasharray={`${dash} ${circumference}`}
                style={{ transition: "stroke-dasharray 1.4s cubic-bezier(0.34,1.56,0.64,1)" }} />
            <defs>
                <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%"   stopColor="#22d3ee" />
                    <stop offset="100%" stopColor="#a78bfa" />
                </linearGradient>
            </defs>
        </svg>
    );
}

function scoreColor(score) {
    if (score >= 85) return "#4ade80";
    if (score >= 70) return "#22d3ee";
    if (score >= 50) return "#fbbf24";
    return "#f87171";
}

function FactorBar({ factor }) {
    const pct = factor.maxPoints > 0 ? (factor.points / factor.maxPoints) * 100 : 0;
    const color = factor.status === "good"    ? "#4ade80"
                : factor.status === "warning" ? "#fbbf24"
                : factor.status === "poor"    ? "#f87171"
                : "#94a3b8";

    return (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{factor.label}</span>
                    <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
                        {factor.impact} impact · {factor.points}/{factor.maxPoints}
                    </span>
                </div>
                <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
                    <div style={{
                        height: "100%", width: `${pct}%`, background: color,
                        borderRadius: 3, transition: "width 1s ease",
                    }} />
                </div>
                <div style={{ fontSize: 11, color: "rgba(148,163,184,0.6)", lineHeight: 1.5 }}>{factor.desc}</div>
            </div>
        </div>
    );
}

function FinancialScoreCard({ scoreData }) {
    if (!scoreData) return null;

    const color = scoreColor(scoreData.score);

    return (
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-7 mb-8"
             style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

            <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full bg-purple-500/10 blur-3xl" />

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                <div className="text-[11px] font-bold tracking-[0.12em] text-zinc-500">FINTWIN SCORE™</div>
                <div style={{
                    fontSize: 12, fontWeight: 700, color,
                    background: color + "18", border: `1px solid ${color}30`,
                    borderRadius: 8, padding: "4px 12px",
                }}>
                    {scoreData.rating}
                </div>
            </div>

            {/* Score Ring + Factors */}
            <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 items-start">

                {/* Left — ring */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div className="relative">
                        <CircleScore score={scoreData.score} />
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <h1 style={{ fontSize: 40, fontWeight: 900, color, letterSpacing: "-0.04em", lineHeight: 1, filter: `drop-shadow(0 0 10px ${color}50)` }}>
                                {scoreData.score}
                            </h1>
                            <span className="text-xs text-zinc-500">/100</span>
                        </div>
                    </div>

                    {/* Mini stats */}
                    <div style={{ marginTop: 16, width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
                        {[
                            { label: "Savings Rate",   value: scoreData.savingsRatio + "%",          color: "#4ade80" },
                            { label: "Budget Score",   value: scoreData.budgetDiscipline + "%",       color: "#22d3ee" },
                            { label: "Recurring",      value: scoreData.recurringExpenseCount + " items", color: "#f87171" },
                        ].map(s => (
                            <div key={s.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                                <span style={{ fontSize: 12, color: "rgba(148,163,184,0.6)" }}>{s.label}</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.value}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right — factor bars */}
                {scoreData.factors?.length > 0 && (
                    <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.1em", marginBottom: 12 }}>SCORE FACTORS</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                            {scoreData.factors.map(f => <FactorBar key={f.label} factor={f} />)}
                        </div>
                    </div>
                )}
            </div>

            {/* Recommendation */}
            <div className="mt-6 rounded-2xl border border-purple-500/15 bg-purple-500/5 p-5">
                <p className="text-sm leading-7 text-zinc-300">
                    {scoreData.score >= 85 && "🚀 Excellent financial health. Your savings habits and budget discipline are outstanding. Consider deploying surplus into investments."}
                    {scoreData.score >= 70 && scoreData.score < 85 && "✅ Good financial stability. Tightening one or two spending categories could push you into the Excellent tier."}
                    {scoreData.score >= 50 && scoreData.score < 70 && "⚠️ Average financial health. Focus on your lowest-scoring factors above — small consistent improvements compound quickly."}
                    {scoreData.score < 50 && "❌ Financial risk detected. Prioritise reducing expenses below 80% of income and set at least one category budget to start building discipline."}
                </p>
            </div>
        </div>
    );
}

export default FinancialScoreCard;
