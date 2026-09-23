import { useState } from "react";
import GlassCard from "./GlassCard";
import API from "../services/api";
import {
    FileText, ShieldAlert, TrendingUp, TrendingDown, Brain, Download,
    Sparkles, Lightbulb, AlertTriangle, Minus, RefreshCw,
} from "lucide-react";

const STORAGE_KEY = "fintwin_weekly_report";

function loadReport() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
function saveReport(report) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ report, savedAt: new Date().toISOString() }));
    } catch {}
}

// Reports cached before findings became structured stored each section as one
// prose string. Rather than showing those users a broken page, fold the old
// shape into a single item.
function asItems(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === "string" && value.trim()) {
        return [{ title: null, detail: value, severity: "medium" }];
    }
    return [];
}

const money = (n) =>
    typeof n === "number" ? `₹${Math.round(n).toLocaleString("en-IN")}` : "—";

// A score is not always good news, so it must not always be green.
function scoreTone(score) {
    if (score >= 80) return { text: "text-emerald-400", stroke: "#34d399", label: "Strong" };
    if (score >= 60) return { text: "text-lime-400",    stroke: "#a3e635", label: "Stable" };
    if (score >= 40) return { text: "text-amber-400",   stroke: "#fbbf24", label: "Needs work" };
    return { text: "text-red-400", stroke: "#f87171", label: "At risk" };
}

const SEVERITY = {
    high:   { chip: "bg-red-500/10 text-red-300 border-red-500/25",       dot: "bg-red-400" },
    medium: { chip: "bg-amber-500/10 text-amber-300 border-amber-500/25", dot: "bg-amber-400" },
    low:    { chip: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25", dot: "bg-emerald-400" },
};

function ScoreRing({ score }) {
    const tone = scoreTone(score);
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.max(0, Math.min(100, score || 0));
    const offset = circumference - (clamped / 100) * circumference;

    return (
        <div className="relative w-[132px] h-[132px] flex-shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 132 132">
                <circle cx="66" cy="66" r={radius} fill="none" strokeWidth="10"
                        stroke="rgba(255,255,255,0.07)" />
                <circle cx="66" cy="66" r={radius} fill="none" strokeWidth="10"
                        stroke={tone.stroke} strokeLinecap="round"
                        strokeDasharray={circumference} strokeDashoffset={offset}
                        style={{ transition: "stroke-dashoffset 700ms ease" }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-3xl font-bold ${tone.text}`}>{score ?? "—"}</span>
                <span className="text-[10px] text-zinc-500 font-medium">/ 100</span>
            </div>
        </div>
    );
}

function TrendChip({ trend }) {
    const { changePercent, direction, goodDirection, label, current, previous } = trend;

    // Direction alone carries no sentiment: expenses up and savings up are both
    // "up", and only one is good.
    const favourable = direction === "flat" ? null : direction === goodDirection;
    const tone = favourable === null ? "text-zinc-400"
        : favourable ? "text-emerald-400" : "text-red-400";
    const Icon = direction === "flat" ? Minus : direction === "up" ? TrendingUp : TrendingDown;

    const isScore = label === "Financial Score";
    const fmt = (v) => (isScore ? Math.round(v) : money(v));

    return (
        <div className="p-4 rounded-xl border border-white/[0.07] bg-white/[0.02]">
            <div className="text-[10px] font-bold tracking-[0.08em] text-zinc-500 mb-2 uppercase">
                {label}
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-lg font-bold text-zinc-100">{fmt(current)}</span>
                <span className={`inline-flex items-center gap-1 text-xs font-semibold ${tone}`}>
                    <Icon size={12} />
                    {changePercent > 0 ? "+" : ""}{changePercent}%
                </span>
            </div>
            <div className="text-[11px] text-zinc-500 mt-1">from {fmt(previous)}</div>
        </div>
    );
}

function FindingCard({ icon: Icon, accent, label, title, items, emptyText }) {
    return (
        <GlassCard className="p-6 border border-white/10 bg-white/[0.03]">
            <div className="flex items-center gap-3 mb-5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent.wrap}`}>
                    <Icon size={16} className={accent.icon} />
                </div>
                <div>
                    <div className={`text-[10px] font-bold tracking-[0.1em] ${accent.label}`}>
                        {label}
                    </div>
                    <h2 className="text-base font-bold">{title}</h2>
                </div>
            </div>

            {items.length === 0 ? (
                <p className="text-sm text-zinc-500">{emptyText}</p>
            ) : (
                <ul className="space-y-4">
                    {items.map((item, i) => {
                        const severity = SEVERITY[item.severity] || SEVERITY.medium;
                        return (
                            <li key={i} className="flex gap-3">
                                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${severity.dot}`} />
                                <div className="min-w-0">
                                    {item.title && (
                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                            <span className="text-sm font-semibold text-zinc-100">
                                                {item.title}
                                            </span>
                                            {item.severity && (
                                                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${severity.chip}`}>
                                                    {item.severity}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    <p className="text-sm leading-6 text-zinc-400">{item.detail}</p>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </GlassCard>
    );
}

function MetricCard({ label, value, tone = "text-zinc-100", hint }) {
    return (
        <GlassCard className="p-5 border border-white/10 bg-white/[0.03]">
            <p className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 mb-2">{label}</p>
            <h3 className={`text-2xl font-bold ${tone}`}>{value}</h3>
            {hint && <p className="text-[11px] text-zinc-500 mt-1.5">{hint}</p>}
        </GlassCard>
    );
}

function WeeklyReport() {
    const saved = loadReport();

    const [report, setReport]     = useState(saved?.report || null);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState(null);
    const [exporting, setExporting] = useState(false);
    const [savedAt, setSavedAt]   = useState(saved?.savedAt || null);

    const fetchReport = async () => {
        setLoading(true);
        setError(null);
        try {
            const { data } = await API.get("/reports/weekly");
            setReport(data);
            saveReport(data);
            setSavedAt(new Date().toISOString());
        } catch (err) {
            console.error("Weekly report load failed:", err);
            // Previously this left the page rendering "undefined/100".
            setError("Could not generate your report. Please try again in a moment.");
        } finally {
            setLoading(false);
        }
    };

    const downloadPDF = async () => {
        setExporting(true);
        try {
            const response = await API.get("/reports/weekly/pdf", { responseType: "blob" });
            const url = window.URL.createObjectURL(response.data);
            const link = document.createElement("a");
            link.href = url;
            link.download = "FinTwin_Report.pdf";
            link.click();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Report PDF export failed:", err);
            setError("PDF export failed. Please try again.");
        } finally {
            setExporting(false);
        }
    };

    // ── Landing ──────────────────────────────────────────────────────────────
    if (!report && !loading) {
        return (
            <GlassCard className="relative overflow-hidden p-10 border border-white/10 bg-white/[0.03] flex flex-col items-center text-center gap-6">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-purple-500/10 border border-purple-500/20">
                    <FileText size={32} className="text-purple-400" />
                </div>
                <div>
                    <div className="text-[11px] font-bold tracking-[0.12em] text-zinc-500 mb-2">
                        EXECUTIVE REPORTS
                    </div>
                    <h1 className="text-3xl font-bold mb-2">Executive Report</h1>
                    <p className="text-sm text-zinc-400 max-w-md">
                        An AI deep-dive into your finances — health score, month-over-month
                        movement, risks and prioritised recommendations.
                    </p>
                </div>

                {error && (
                    <div className="px-4 py-2.5 rounded-xl border border-red-500/25 bg-red-500/5 text-sm text-red-300">
                        {error}
                    </div>
                )}

                <button
                    onClick={fetchReport}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-purple-600 hover:bg-purple-700 transition-colors"
                >
                    <Sparkles size={18} />
                    Generate Report
                </button>
            </GlassCard>
        );
    }

    // ── First-run loading (a regenerate keeps the existing report on screen) ──
    if (loading && !report) {
        return (
            <GlassCard className="relative overflow-hidden p-10 border border-white/10 bg-white/[0.03] flex flex-col items-center text-center gap-6">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-purple-500/10 border border-purple-500/20 animate-pulse">
                    <Brain size={32} className="text-purple-400" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold mb-2">Generating your executive report…</h2>
                    <p className="text-sm text-zinc-400">
                        Analysing transactions, goals and month-over-month movement
                    </p>
                </div>
                <div className="flex gap-1.5">
                    {[0, 1, 2].map((i) => (
                        <span key={i} className="w-2 h-2 rounded-full bg-purple-500 animate-bounce"
                              style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                </div>
            </GlassCard>
        );
    }

    const insights        = asItems(report?.insights);
    const risks           = asItems(report?.risks);
    const recommendations = asItems(report?.recommendations);
    const trends          = Array.isArray(report?.trends) ? report.trends : [];
    const tone            = scoreTone(report?.financialScore ?? 0);

    return (
        <div className="space-y-6">

            {/* HEADER */}
            <GlassCard className="relative overflow-hidden p-6 border border-white/10 bg-white/[0.03]">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <div className="text-[11px] font-bold tracking-[0.12em] text-zinc-500 mb-1">
                            EXECUTIVE REPORTS
                        </div>
                        <h1 className="text-2xl font-bold">Executive Report</h1>
                        <p className="text-sm text-zinc-500 mt-1">
                            {report?.comparisonPeriod
                                ? `Comparing ${report.comparisonPeriod}`
                                : "AI-generated financial intelligence"}
                        </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {savedAt && (
                            <span className="text-[11px] text-zinc-500 font-mono">
                                Generated {new Date(savedAt).toLocaleString()}
                            </span>
                        )}
                        <button
                            onClick={fetchReport}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading
                                ? <><RefreshCw size={16} className="animate-spin" /> Regenerating…</>
                                : <><Sparkles size={16} /> Regenerate</>}
                        </button>
                        <button
                            onClick={downloadPDF}
                            disabled={exporting || loading}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold ${
                                exporting ? "bg-purple-800 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700"
                            }`}
                        >
                            <Download size={16} />
                            {exporting ? "Exporting…" : "Export PDF"}
                        </button>
                    </div>
                </div>
            </GlassCard>

            {error && (
                <div className="px-4 py-3 rounded-xl border border-red-500/25 bg-red-500/5 text-sm text-red-300">
                    {error}
                </div>
            )}

            {/* Template text must not pass for analysis. */}
            {report?.degraded && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/25 bg-amber-500/5">
                    <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-amber-200/90">
                        AI analysis was unavailable, so parts of this report fall back to
                        calculated figures. The numbers are accurate; the commentary is
                        templated. Try regenerating in a moment.
                    </p>
                </div>
            )}

            {/* SCORE + HEADLINE METRICS */}
            <div className="grid grid-cols-1 xl:grid-cols-[auto_1fr] gap-4">
                <GlassCard className="p-6 border border-white/10 bg-white/[0.03] flex items-center gap-6">
                    <ScoreRing score={report?.financialScore} />
                    <div>
                        <div className="text-[10px] font-bold tracking-[0.1em] text-zinc-500 mb-1">
                            FINANCIAL HEALTH
                        </div>
                        <h2 className={`text-xl font-bold ${tone.text}`}>{tone.label}</h2>
                        {typeof report?.savingsRate === "number" && (
                            <p className="text-sm text-zinc-500 mt-1">
                                {report.savingsRate}% savings rate
                            </p>
                        )}
                    </div>
                </GlassCard>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    <MetricCard label="Net Worth" value={money(report?.netWorth)} tone="text-purple-400" />
                    <MetricCard label="Spending Health" value={report?.spendingHealth || "—"} />
                    <MetricCard
                        label="Monthly Leakage"
                        value={money(report?.monthlyLeakage)}
                        tone={report?.monthlyLeakage > 0 ? "text-red-400" : "text-emerald-400"}
                    />
                    <MetricCard
                        label="Projected Savings"
                        value={money(report?.predictedSavings)}
                        tone="text-cyan-400"
                        hint="Next month, trailing average"
                    />
                </div>
            </div>

            {/* MONTH-OVER-MONTH */}
            {trends.length > 0 && (
                <GlassCard className="p-6 border border-white/10 bg-white/[0.03]">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                        <div className="text-[10px] font-bold tracking-[0.1em] text-zinc-500">
                            MONTH OVER MONTH
                        </div>
                        {report?.comparisonPeriod && (
                            <span className="text-[11px] text-zinc-500">{report.comparisonPeriod}</span>
                        )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                        {trends.map((trend) => (
                            <TrendChip key={trend.label} trend={trend} />
                        ))}
                    </div>
                </GlassCard>
            )}

            {/* SUMMARY */}
            <GlassCard className="p-6 border border-white/10 bg-white/[0.03]">
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-cyan-500/10 border border-cyan-500/20">
                        <FileText size={16} className="text-cyan-400" />
                    </div>
                    <div>
                        <div className="text-[10px] font-bold tracking-[0.1em] text-cyan-400/60">
                            EXECUTIVE SUMMARY
                        </div>
                        <h2 className="text-base font-bold">Summary</h2>
                    </div>
                </div>
                <p className="text-sm leading-7 text-zinc-300">{report?.summary}</p>
            </GlassCard>

            {/* FINDINGS */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <FindingCard
                    icon={Lightbulb} label="AI INSIGHTS" title="Insights" items={insights}
                    emptyText="No insights available for this period."
                    accent={{ wrap: "bg-purple-500/10 border border-purple-500/20",
                              icon: "text-purple-400", label: "text-purple-400/60" }}
                />
                <FindingCard
                    icon={ShieldAlert} label="RISK ANALYSIS" title="Risks" items={risks}
                    emptyText="No material risks detected."
                    accent={{ wrap: "bg-red-500/10 border border-red-500/20",
                              icon: "text-red-400", label: "text-red-400/60" }}
                />
                <FindingCard
                    icon={TrendingUp} label="RECOMMENDATIONS" title="Recommendations" items={recommendations}
                    emptyText="No recommendations available."
                    accent={{ wrap: "bg-emerald-500/10 border border-emerald-500/20",
                              icon: "text-emerald-400", label: "text-emerald-400/60" }}
                />
            </div>

            <p className="text-[11px] text-zinc-600 leading-5">
                Educational analysis generated from your own financial data. Not investment advice.
            </p>
        </div>
    );
}

export default WeeklyReport;
