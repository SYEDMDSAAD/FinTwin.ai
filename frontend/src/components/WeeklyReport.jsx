import { useEffect, useState } from "react";
import API from "../services/api";
import {
    FileText, ShieldAlert, TrendingUp, TrendingDown, Download,
    Sparkles, Lightbulb, AlertTriangle, Minus, RefreshCw,
} from "lucide-react";
import { Button, Badge, SectionHeader, EmptyState, IconChip, Progress, cx } from "./ui";

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
    if (score >= 80) return { tone: "good", label: "Strong" };
    if (score >= 60) return { tone: "good", label: "Stable" };
    if (score >= 40) return { tone: "warn", label: "Needs work" };
    return { tone: "bad", label: "At risk" };
}

const SEVERITY_TONE = { high: "bad", medium: "warn", low: "good" };
const SEVERITY_LABEL = { high: "High", medium: "Medium", low: "Low" };

function Trend({ trend }) {
    const { changePercent, direction, goodDirection, label, current, previous } = trend;

    // Direction alone carries no sentiment: expenses up and savings up are both
    // "up", and only one is good.
    const favourable = direction === "flat" ? null : direction === goodDirection;
    const tone = favourable === null ? "text-ink-3" : favourable ? "text-good" : "text-bad";
    const Icon = direction === "flat" ? Minus : direction === "up" ? TrendingUp : TrendingDown;

    const isScore = label === "Financial Score";
    const fmt = (v) => (isScore ? Math.round(v) : money(v));

    return (
        <li className="flex items-center justify-between gap-3 px-4 py-3.5">
            <span className="min-w-0">
                <span className="block text-body text-ink">{label === "Financial Score" ? "Health score" : label}</span>
                <span className="block text-small text-ink-3 num">from {fmt(previous)}</span>
            </span>
            <span className="text-right shrink-0">
                <span className="block text-body font-semibold text-ink num">{fmt(current)}</span>
                <span className={cx("inline-flex items-center gap-1 text-small font-medium num", tone)}>
                    <Icon size={12} aria-hidden />
                    {changePercent > 0 ? "+" : changePercent < 0 ? "−" : ""}{Math.abs(changePercent)}%
                </span>
            </span>
        </li>
    );
}

function Findings({ icon, tone, title, items, emptyText }) {
    return (
        <section aria-label={title}>
            <SectionHeader title={title} />
            <ul className="rounded-card bg-surface border border-line divide-y divide-line">
                {items.length === 0 && (
                    <li className="flex items-center gap-3 px-4 py-3.5">
                        <IconChip icon={icon} tone={tone} size="sm" />
                        <span className="text-small text-ink-3">{emptyText}</span>
                    </li>
                )}
                {items.map((item, i) => (
                    <li key={i} className="flex items-start gap-3 px-4 py-3.5">
                        <IconChip icon={icon} tone={tone} size="sm" className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                            {item.title && (
                                <div className="flex items-start justify-between gap-2">
                                    <span className="text-body text-ink">{item.title}</span>
                                    {item.severity && SEVERITY_TONE[item.severity] && (
                                        <Badge tone={SEVERITY_TONE[item.severity]} className="shrink-0">{SEVERITY_LABEL[item.severity]}</Badge>
                                    )}
                                </div>
                            )}
                            <p className={cx("text-small text-ink-2", item.title && "mt-0.5")}>{item.detail}</p>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}

function WeeklyReport() {
    const saved = loadReport();

    const [report, setReport]     = useState(saved?.report || null);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState(null);
    const [exporting, setExporting] = useState(false);
    const [savedAt, setSavedAt]   = useState(saved?.savedAt || null);

    // The weekly agent writes this week's report on the first visit of the
    // week and keeps it in the account: show that one when it's there.
    useEffect(() => {
        let alive = true;
        API.get("/reports/weekly/latest")
            .then(({ status, data }) => {
                if (!alive || status !== 200 || !data) return;
                setReport(data);
                saveReport(data);
                setSavedAt(data.generatedAt || new Date().toISOString());
            })
            .catch(() => {});
        return () => { alive = false; };
    }, []);

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
            <div className="max-w-2xl">
                <EmptyState
                    icon={FileText}
                    title="Your money report"
                    body="A look at the last few months: your health score, what moved, the risks and what to do first."
                    action={<Button icon={Sparkles} onClick={fetchReport}>Generate report</Button>}
                />
                {error && <p role="alert" className="mt-4 px-4 py-3 rounded-control bg-bad-soft text-small text-bad">{error}</p>}
            </div>
        );
    }

    // ── First-run loading (a regenerate keeps the existing report on screen) ──
    if (loading && !report) {
        return (
            <div className="max-w-2xl rounded-card bg-surface border border-line px-6 py-12 text-center" role="status">
                <RefreshCw size={22} aria-hidden className="mx-auto text-accent animate-spin" />
                <p className="mt-4 text-heading text-ink">Putting your report together…</p>
                <p className="mt-1 text-small text-ink-3">Going through your payments, goals and how each month moved.</p>
            </div>
        );
    }

    const insights        = asItems(report?.insights);
    const risks           = asItems(report?.risks);
    const recommendations = asItems(report?.recommendations);
    const trends          = Array.isArray(report?.trends) ? report.trends : [];
    const score           = report?.financialScore;
    const tone            = scoreTone(score ?? 0);
    const figures = [
        { label: "Net worth", value: money(report?.netWorth), cls: "text-ink" },
        { label: "Spending", value: report?.spendingHealth || "—", cls: "text-ink" },
        { label: "Leaking each month", note: "Avoidable spending", value: money(report?.monthlyLeakage), cls: report?.monthlyLeakage > 0 ? "text-bad" : "text-good" },
        { label: "Likely saved next month", note: "From your recent average", value: money(report?.predictedSavings), cls: "text-ink" },
    ];

    return (
        <div className="max-w-2xl space-y-8">
            {/* The number */}
            <section aria-label="Report" className="px-1">
                <p className="text-small text-ink-3">
                    Health score{report?.comparisonPeriod ? ` · ${report.comparisonPeriod}` : ""}
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-hero text-ink num">{score ?? "—"}</span>
                    <span className="text-heading text-ink-3 font-medium">out of 100</span>
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <Badge tone={tone.tone}>{tone.label}</Badge>
                    {typeof report?.savingsRate === "number" && (
                        <span className="text-body text-ink-2">Saving {report.savingsRate}% of income</span>
                    )}
                </div>
                <Progress className="mt-4" value={Math.max(0, Math.min(100, score || 0))} tone={tone.tone} label="Health score" />

                <div className="mt-5 flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" icon={loading ? RefreshCw : Sparkles} onClick={fetchReport} disabled={loading}>
                        {loading ? "Regenerating…" : "Regenerate"}
                    </Button>
                    <Button size="sm" variant="secondary" icon={Download} onClick={downloadPDF} disabled={exporting || loading}>
                        {exporting ? "Saving…" : "Save as PDF"}
                    </Button>
                </div>
                {savedAt && (
                    <p className="mt-2 text-caption text-ink-3">
                        Made {new Date(savedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                    </p>
                )}
            </section>

            {error && <p role="alert" className="px-4 py-3 rounded-control bg-bad-soft text-small text-bad">{error}</p>}

            {/* Template text must not pass for analysis. */}
            {report?.degraded && (
                <div className="flex items-start gap-3 p-4 rounded-card bg-warn-soft">
                    <AlertTriangle size={18} aria-hidden className="shrink-0 mt-0.5 text-warn" />
                    <p className="text-small text-ink-2">
                        AI analysis was unavailable, so the comments below are standard text. The numbers are
                        still worked out from your data. Try regenerating in a moment.
                    </p>
                </div>
            )}

            {report?.summary && (
                <section aria-label="Summary">
                    <SectionHeader title="In short" />
                    <p className="px-1 text-body text-ink-2 leading-relaxed">{report.summary}</p>
                </section>
            )}

            <ul className="rounded-card bg-surface border border-line divide-y divide-line">
                {figures.map((f) => (
                    <li key={f.label} className="flex items-center justify-between gap-3 px-4 py-3.5">
                        <span className="min-w-0">
                            <span className="block text-body text-ink">{f.label}</span>
                            {f.note && <span className="block text-small text-ink-3">{f.note}</span>}
                        </span>
                        <span className={cx("text-body font-semibold num text-right", f.cls)}>{f.value}</span>
                    </li>
                ))}
            </ul>

            {trends.length > 0 && (
                <section aria-label="Month over month">
                    <SectionHeader title="Month over month" subtitle={report?.comparisonPeriod || null} />
                    <ul className="rounded-card bg-surface border border-line divide-y divide-line">
                        {trends.map((trend) => <Trend key={trend.label} trend={trend} />)}
                    </ul>
                </section>
            )}

            <Findings icon={TrendingUp} tone="good" title="What to do" items={recommendations}
                      emptyText="No recommendations available." />
            <Findings icon={ShieldAlert} tone="bad" title="Risks" items={risks}
                      emptyText="No material risks detected." />
            <Findings icon={Lightbulb} tone="accent" title="What we noticed" items={insights}
                      emptyText="No insights available for this period." />

            <p className="px-1 text-caption text-ink-3">
                Worked out from your own data, for learning. Not investment advice.
            </p>
        </div>
    );
}

export default WeeklyReport;
