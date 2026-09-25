import { Fragment, useCallback, useEffect, useState } from "react";
import { RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import API from "../../services/api";

// Model tokens used per user and per AI feature. The AI service reports each
// request's counts and the backend adds them to the user's daily totals, so
// this shows real usage of the self-hosted model, not an estimate.

const faint = "rgba(148,163,184,0.45)";
const muted = "rgba(148,163,184,0.6)";

// One fixed categorical slot per feature, never reassigned by rank, so a
// feature keeps its colour in every view. Light and dark each get the step
// that passes the colour-vision checks against that surface (validated with
// the dataviz palette validator); "other" is neutral gray.
const FEATURES = {
    copilot:          { label: "Copilot",              light: "#2a78d6", dark: "#3987e5" },
    coach:            { label: "Spending coach",       light: "#eb6834", dark: "#d95926" },
    goal_plan:        { label: "Goal planner",         light: "#1baf7a", dark: "#199e70" },
    report:           { label: "Weekly report",        light: "#eda100", dark: "#c98500" },
    category_suggest: { label: "Category suggestions", light: "#e87ba4", dark: "#d55181" },
    investments:      { label: "Investments",          light: "#008300", dark: "#008300" },
    advisor:          { label: "Advisor",              light: "#4a3aa7", dark: "#9085e9" },
    other:            { label: "Other",                light: "#8a8f98", dark: "#8a8f98" },
};
const FEATURE_VARS = `
  .ai-usage { ${Object.entries(FEATURES).map(([f, c]) => `--f-${f}: ${c.dark};`).join(" ")} --f-unknown: #8a8f98; }
  [data-theme="light"] .ai-usage { ${Object.entries(FEATURES).map(([f, c]) => `--f-${f}: ${c.light};`).join(" ")} }
`;
const featureLabel = (f) => FEATURES[f]?.label || f;
const featureColor = (f) => `var(--f-${FEATURES[f] ? f : "unknown"})`;
// The daily chart is one series (total tokens), so it takes a neutral ink
// rather than a feature colour it could be confused with.
const DAILY_BAR = "#64748b";

const RANGES = [7, 30, 90];

const exact = (n) => (n ?? 0).toLocaleString("en-IN");
const compact = (n) => {
    const v = n ?? 0;
    if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}K`;
    return String(v);
};
const day = (d) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

function SplitBar({ byFeature, total }) {
    const parts = Object.entries(byFeature || {}).sort((a, b) => b[1].totalTokens - a[1].totalTokens);
    return (
        <div style={{ display: "flex", gap: 2, height: 8, borderRadius: 4, overflow: "hidden", minWidth: 120 }}
             role="img" aria-label={parts.map(([f, u]) => `${featureLabel(f)} ${exact(u.totalTokens)} tokens`).join(", ")}>
            {parts.map(([f, u]) => (
                <div key={f} title={`${featureLabel(f)}: ${exact(u.totalTokens)} tokens`}
                     style={{ width: `${total ? (u.totalTokens / total) * 100 : 0}%`, background: featureColor(f) }} />
            ))}
        </div>
    );
}

const DailyTip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <div style={{ background: "#0e1018", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#e2e8f0" }}>
            <div style={{ color: muted, marginBottom: 4 }}>{day(label)}</div>
            <div style={{ fontWeight: 700 }}>{exact(d.totalTokens)} tokens</div>
            <div style={{ color: muted }}>{exact(d.inputTokens)} input · {exact(d.outputTokens)} output · {exact(d.calls)} {d.calls === 1 ? "call" : "calls"}</div>
        </div>
    );
};

export default function AdminAiUsage() {
    const [days, setDays] = useState(30);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(null);

    const fetchUsage = useCallback(() =>
        API.get("/admin/ai-usage", { params: { days } })
            .then(r => setData(r.data))
            .catch(() => toast.error("Couldn't load AI usage"))
            .finally(() => setLoading(false)), [days]);
    useEffect(() => { fetchUsage(); }, [fetchUsage]);
    const load = () => { setLoading(true); fetchUsage(); };
    const pickRange = (d) => { if (d !== days) { setLoading(true); setOpen(null); setDays(d); } };

    const t = data?.totals;
    const daily = (data?.daily || []).map(d => ({ ...d, totalTokens: d.inputTokens + d.outputTokens }));
    const maxFeature = Math.max(1, ...(data?.byFeature || []).map(f => f.totalTokens));

    return (
        <section aria-label="AI token usage" className="fade-in ai-usage">
            <style>{FEATURE_VARS}</style>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, fontSize: 12, color: muted }}>
                    Tokens read (input) and written (output) by the AI model, per user and per feature.
                </div>
                {RANGES.map(d => (
                    <button key={d} className="ab" onClick={() => pickRange(d)} aria-pressed={days === d}
                            style={{ padding: "8px 13px",
                                     background: days === d ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.04)",
                                     color: days === d ? "#a78bfa" : muted,
                                     border: `1px solid ${days === d ? "rgba(167,139,250,0.3)" : "rgba(255,255,255,0.08)"}` }}>
                        {d} days
                    </button>
                ))}
                <button className="ab ab-gray" onClick={load} style={{ padding: "8px 13px" }}>
                    <RefreshCw size={12} className={loading ? "spin" : ""} /> Refresh
                </button>
            </div>

            <div className="grid4" style={{ marginBottom: 16 }}>
                {[
                    { label: "Total tokens", val: t?.totalTokens, color: "#a78bfa" },
                    { label: "Input tokens", val: t?.inputTokens, color: "#22d3ee" },
                    { label: "Output tokens", val: t?.outputTokens, color: "#34d399" },
                    { label: "Model calls", val: t?.calls, color: "#fbbf24" },
                    { label: "Users using AI", val: t?.activeUsers, color: "#e2e8f0" },
                ].map(c => (
                    <div key={c.label} className="stat-card">
                        <div style={{ fontSize: 10, fontWeight: 700, color: faint, letterSpacing: "0.08em", marginBottom: 10 }}>{c.label.toUpperCase()}</div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: c.color }} title={loading ? undefined : exact(c.val)}>
                            {loading ? "—" : compact(c.val)}
                        </div>
                    </div>
                ))}
            </div>

            {!loading && !data?.totals?.calls ? (
                <div className="card" style={{ padding: 40, textAlign: "center", color: faint, fontSize: 13 }}>
                    No AI usage recorded in the last {days} days.
                </div>
            ) : data && (
                <>
                    <div className="grid2" style={{ marginBottom: 16 }}>
                        <div className="card" style={{ padding: 18 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: faint, letterSpacing: "0.08em", marginBottom: 12 }}>BY AI FEATURE</div>
                            {data.byFeature.map(f => (
                                <div key={f.feature} style={{ padding: "7px 0" }}>
                                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 12, color: "#e2e8f0", marginBottom: 5 }}>
                                        <span style={{ width: 8, height: 8, borderRadius: 2, background: featureColor(f.feature), flexShrink: 0 }} aria-hidden />
                                        <span style={{ flex: 1 }}>{featureLabel(f.feature)}</span>
                                        <span style={{ fontWeight: 700 }} title={`${exact(f.inputTokens)} in · ${exact(f.outputTokens)} out`}>{compact(f.totalTokens)}</span>
                                        <span style={{ color: faint, width: 150, textAlign: "right" }}>{exact(f.calls)} {f.calls === 1 ? "call" : "calls"} · {f.users} {f.users === 1 ? "user" : "users"}</span>
                                    </div>
                                    <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.05)" }}>
                                        <div style={{ height: 4, borderRadius: 2, width: `${(f.totalTokens / maxFeature) * 100}%`, background: featureColor(f.feature) }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="card" style={{ padding: 18 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: faint, letterSpacing: "0.08em", marginBottom: 12 }}>TOKENS PER DAY</div>
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={daily} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                                    <XAxis dataKey="date" tickFormatter={day} tick={{ fontSize: 10, fill: faint }} axisLine={false} tickLine={false} />
                                    <YAxis tickFormatter={compact} tick={{ fontSize: 10, fill: faint }} axisLine={false} tickLine={false} />
                                    <Tooltip content={<DailyTip />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
                                    <Bar dataKey="totalTokens" name="Tokens" fill={DAILY_BAR} radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive={false} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="card" style={{ overflow: "hidden" }}>
                        <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "baseline", gap: 10 }}>
                            <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>Usage by user</div>
                            <div style={{ fontSize: 11, color: muted }}>
                                {data.users.length < data.userCount
                                    ? `Top ${data.users.length} of ${data.userCount} users`
                                    : `${data.userCount} ${data.userCount === 1 ? "user" : "users"}`} · heaviest first · select a row for its per-feature split
                            </div>
                        </div>
                        <div style={{ overflowX: "auto" }}>
                            <table className="tbl">
                                <thead>
                                    <tr><th>USER</th><th style={{ textAlign: "right" }}>TOTAL</th><th style={{ textAlign: "right" }}>INPUT</th>
                                        <th style={{ textAlign: "right" }}>OUTPUT</th><th style={{ textAlign: "right" }}>CALLS</th><th>BY FEATURE</th><th>LAST USED</th></tr>
                                </thead>
                                <tbody>
                                    {data.users.map(u => (
                                        <Fragment key={u.userId}>
                                            <tr onClick={() => setOpen(open === u.userId ? null : u.userId)} style={{ cursor: "pointer" }}>
                                                <td>
                                                    <button type="button" aria-expanded={open === u.userId}
                                                            onClick={(e) => { e.stopPropagation(); setOpen(open === u.userId ? null : u.userId); }}
                                                            style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: 0 }}>
                                                        {open === u.userId ? <ChevronDown size={14} color={muted} aria-hidden /> : <ChevronRight size={14} color={muted} aria-hidden />}
                                                        <span>
                                                            <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{u.fullName || `User #${u.userId}`}</span>
                                                            <span style={{ display: "block", fontSize: 11, color: faint }}>{u.email || "—"}</span>
                                                        </span>
                                                    </button>
                                                </td>
                                                <td style={{ textAlign: "right", fontWeight: 700, color: "#e2e8f0" }} title={exact(u.totalTokens)}>{compact(u.totalTokens)}</td>
                                                <td style={{ textAlign: "right", color: muted }} title={exact(u.inputTokens)}>{compact(u.inputTokens)}</td>
                                                <td style={{ textAlign: "right", color: muted }} title={exact(u.outputTokens)}>{compact(u.outputTokens)}</td>
                                                <td style={{ textAlign: "right", color: muted }}>{exact(u.calls)}</td>
                                                <td style={{ width: 180 }}><SplitBar byFeature={u.byFeature} total={u.totalTokens} /></td>
                                                <td style={{ fontSize: 11, color: faint, whiteSpace: "nowrap" }}>{u.lastUsed ? day(u.lastUsed) : "—"}</td>
                                            </tr>
                                            {open === u.userId && (
                                                <tr>
                                                    <td colSpan={7} style={{ background: "rgba(255,255,255,0.015)", padding: "6px 18px 14px 44px" }}>
                                                        <table className="tbl" aria-label={`AI usage by feature for ${u.fullName || u.email || `user ${u.userId}`}`}>
                                                            <thead><tr><th>FEATURE</th><th style={{ textAlign: "right" }}>TOTAL</th><th style={{ textAlign: "right" }}>INPUT</th>
                                                                <th style={{ textAlign: "right" }}>OUTPUT</th><th style={{ textAlign: "right" }}>CALLS</th><th style={{ textAlign: "right" }}>SHARE</th></tr></thead>
                                                            <tbody>
                                                                {Object.entries(u.byFeature).sort((a, b) => b[1].totalTokens - a[1].totalTokens).map(([f, s]) => (
                                                                    <tr key={f}>
                                                                        <td><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                                                            <span style={{ width: 8, height: 8, borderRadius: 2, background: featureColor(f) }} aria-hidden />{featureLabel(f)}
                                                                        </span></td>
                                                                        <td style={{ textAlign: "right", fontWeight: 700 }}>{exact(s.totalTokens)}</td>
                                                                        <td style={{ textAlign: "right", color: muted }}>{exact(s.inputTokens)}</td>
                                                                        <td style={{ textAlign: "right", color: muted }}>{exact(s.outputTokens)}</td>
                                                                        <td style={{ textAlign: "right", color: muted }}>{exact(s.calls)}</td>
                                                                        <td style={{ textAlign: "right", color: muted }}>{u.totalTokens ? Math.round((s.totalTokens / u.totalTokens) * 100) : 0}%</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </section>
    );
}
