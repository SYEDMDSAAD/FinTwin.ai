import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import API from "../../services/api";

// How users rate copilot answers, split by the path that produced them, why
// unhelpful ones were unhelpful, and the latest unhelpful answers themselves
// (only from users who opted in to their answers being read).

const faint = "rgba(148,163,184,0.45)";
const muted = "rgba(148,163,184,0.6)";

const PATH_LABELS = {
    portfolio_direct: "Answered from the figures (no model)",
    tools: "Model with data tools",
    legacy: "Model without tools",
    fallback: "Model unavailable",
    unavailable: "AI service unreachable",
    empty_response: "Empty reply",
    unknown: "Not recorded",
};
const REASON_LABELS = {
    WRONG_NUMBERS: "Wrong numbers", DIDNT_ANSWER: "Didn't answer", NOT_USEFUL: "Not useful",
    TOO_LONG: "Too long", OTHER: "Something else", NO_REASON: "No reason given",
};
const rateColor = (r) => (r === null ? faint : r >= 80 ? "#4ade80" : r >= 60 ? "#fbbf24" : "#f87171");

function Trace({ json }) {
    let t = null;
    try { t = JSON.parse(json || "null"); } catch { /* shown raw below */ }
    if (!t) return json ? <code style={{ fontSize: 11, color: muted }}>{json}</code> : null;
    const tools = (t.tools || []).map(x => `${x.name}(${Object.entries(x.args || {}).map(([k, v]) => `${k}=${v}`).join(", ")})${x.ok === false ? " ✗" : ""}`);
    return (
        <div style={{ fontSize: 11, color: muted, lineHeight: 1.7 }}>
            {[
                t.path && `path: ${t.path}`,
                t.outcome && `outcome: ${t.outcome}`,
                t.portfolio_check && `portfolio check: ${t.portfolio_check}`,
                tools.length ? `tools: ${tools.join(" → ")}` : null,
                t.duration_ms != null && `${(t.duration_ms / 1000).toFixed(1)} s`,
                t.mode && `mode: ${t.mode}`,
            ].filter(Boolean).join(" · ")}
        </div>
    );
}

export default function AdminCopilotFeedback() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(null);

    const fetchStats = useCallback(() =>
        API.get("/admin/copilot/feedback-stats")
            .then(r => setData(r.data))
            .catch(() => toast.error("Couldn't load copilot feedback"))
            .finally(() => setLoading(false)), []);
    useEffect(() => { fetchStats(); }, [fetchStats]);            // loading starts true
    const load = () => { setLoading(true); fetchStats(); };

    const reasons = Object.entries(data?.reasons || {}).sort((a, b) => b[1] - a[1]);

    return (
        <section aria-label="Copilot feedback" style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 800, color: "#e2e8f0" }}>AI Copilot answers</h2>
                <button className="ab ab-gray" onClick={load} style={{ padding: "8px 13px" }}>
                    <RefreshCw size={12} className={loading ? "spin" : ""} /> Refresh
                </button>
            </div>

            <div className="grid4" style={{ marginBottom: 16 }}>
                {[
                    { label: "Rated answers", val: data?.rated ?? 0, color: "#a78bfa" },
                    { label: "Helpful", val: data?.helpful ?? 0, color: "#4ade80" },
                    { label: "Not helpful", val: data?.notHelpful ?? 0, color: "#f87171" },
                    { label: "Helpful rate", val: data?.helpfulRate == null ? "—" : `${data.helpfulRate}%`, color: rateColor(data?.helpfulRate ?? null) },
                ].map(c => (
                    <div key={c.label} className="stat-card">
                        <div style={{ fontSize: 10, fontWeight: 700, color: faint, letterSpacing: "0.08em", marginBottom: 10 }}>{c.label.toUpperCase()}</div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: c.color }}>{loading ? "—" : c.val}</div>
                    </div>
                ))}
            </div>

            {data?.rated > 0 && (
                <div className="grid2" style={{ marginBottom: 16 }}>
                    <div className="card" style={{ padding: 18 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: faint, letterSpacing: "0.08em", marginBottom: 12 }}>BY HOW THE ANSWER WAS PRODUCED</div>
                        {data.byPath.map(p => (
                            <div key={p.path} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", fontSize: 12, color: "#e2e8f0" }}>
                                <span style={{ flex: 1 }}>{PATH_LABELS[p.path] || p.path}</span>
                                <span style={{ color: muted }}>👍 {p.helpful} · 👎 {p.notHelpful}</span>
                                <span style={{ width: 52, textAlign: "right", fontWeight: 700, color: rateColor(p.helpfulRate) }}>{p.helpfulRate}%</span>
                            </div>
                        ))}
                    </div>
                    <div className="card" style={{ padding: 18 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: faint, letterSpacing: "0.08em", marginBottom: 12 }}>WHY ANSWERS WEREN'T HELPFUL</div>
                        {reasons.length === 0
                            ? <div style={{ fontSize: 12, color: faint }}>No unhelpful answers yet.</div>
                            : reasons.map(([code, n]) => (
                                <div key={code} style={{ display: "flex", padding: "6px 0", fontSize: 12, color: "#e2e8f0" }}>
                                    <span style={{ flex: 1 }}>{REASON_LABELS[code] || code}</span>
                                    <span style={{ fontWeight: 700 }}>{n}</span>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            <div className="card" style={{ overflow: "hidden" }}>
                <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>Latest unhelpful answers</div>
                    <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>Only from users who turned on "Help improve FinTwin's AI".</div>
                </div>
                {!data?.recentNotHelpful?.length ? (
                    <div style={{ padding: 30, textAlign: "center", color: faint, fontSize: 12 }}>None to show yet.</div>
                ) : data.recentNotHelpful.map((f, i) => (
                    <div key={i} style={{ borderTop: i ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                        <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}
                                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                            {open === i ? <ChevronDown size={14} color={muted} aria-hidden /> : <ChevronRight size={14} color={muted} aria-hidden />}
                            <span style={{ flex: 1, fontSize: 13, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.question}</span>
                            {f.reason && <span className="badge b-off">{REASON_LABELS[f.reason] || f.reason}</span>}
                        </button>
                        {open === i && (
                            <div style={{ padding: "0 18px 16px 42px", display: "grid", gap: 10 }}>
                                <div style={{ fontSize: 13, lineHeight: 1.7, color: "#cbd5e1", whiteSpace: "pre-wrap" }}>{f.answer}</div>
                                <Trace json={f.trace} />
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}
