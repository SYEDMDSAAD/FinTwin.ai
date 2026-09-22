import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import API from "../../services/api";

// How each categorisation method is doing, from the labels users create by
// correcting or keeping categories — and how much of it could be used for
// training (reviewed rows from users who opted in).

const faint = "rgba(148,163,184,0.45)";
const muted = "rgba(148,163,184,0.6)";

const METHOD_LABELS = {
    BRAND: "Known brand",
    SHOP_WORD: "Shop-name word",
    PERSON: "Looks like a person",
    LEARNED: "User's saved rule",
    SELF_TRANSFER: "Own-account transfer",
    NONE: "No match → Other",
    FORCED: "Card bookkeeping",
    PROVIDED: "Category in the file",
    BANK_KEYWORD: "Bank-sync keyword",
    LLM: "AI suggestion (qwen2.5:3b)",
    USER: "Chosen by the user",
    LEGACY: "Before tracking began",
    UNRECORDED: "Not recorded (older rows)",
};

const rateColor = (r) => (r === null ? faint : r >= 30 ? "#f87171" : r >= 10 ? "#fbbf24" : "#4ade80");
const n = (v) => Number(v || 0).toLocaleString("en-IN");

export default function AdminCategorization() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchStats = useCallback(() =>
        API.get("/admin/categorization/stats")
            .then(r => setData(r.data))
            .catch(() => toast.error("Couldn't load categorisation stats"))
            .finally(() => setLoading(false)), []);
    useEffect(() => { fetchStats(); }, [fetchStats]);            // loading starts true
    const load = () => { setLoading(true); fetchStats(); };

    return (
        <div className="fade-in">
            <div className="grid4" style={{ marginBottom: 20 }}>
                {[
                    { label: "Real transactions", val: n((data?.transactions || 0) - (data?.excludedSampleData || 0)), color: "#a78bfa" },
                    { label: "Reviewed by users", val: n(data?.reviewedByUsers), color: "#22d3ee" },
                    { label: "Training-ready labels", val: n(data?.trainingReadyLabels), color: "#4ade80" },
                    { label: "Users opted in", val: n(data?.usersConsentedToTraining), color: "#fbbf24" },
                ].map(c => (
                    <div key={c.label} className="stat-card">
                        <div style={{ fontSize: 10, fontWeight: 700, color: faint, letterSpacing: "0.08em", marginBottom: 10 }}>{c.label.toUpperCase()}</div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: c.color }}>{loading ? "—" : c.val}</div>
                    </div>
                ))}
            </div>

            <div className="card" style={{ overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>By categorisation method</div>
                        <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>
                            Correction rate = corrected ÷ (corrected + kept), counting only rows a user changed or kept one at a time.
                            {data?.excludedSampleData ? ` ${n(data.excludedSampleData)} sandbox and sample rows are left out.` : ""}
                        </div>
                    </div>
                    <button className="ab ab-gray" onClick={load} style={{ padding: "8px 13px" }}>
                        <RefreshCw size={12} className={loading ? "spin" : ""} /> Refresh
                    </button>
                </div>
                {loading && !data ? (
                    <div style={{ padding: 40, textAlign: "center", color: faint }}>Loading…</div>
                ) : !data?.methods?.length ? (
                    <div style={{ padding: 40, textAlign: "center", color: faint }}>No real transactions yet.</div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                                <tr style={{ color: faint, fontSize: 10, letterSpacing: "0.08em", textAlign: "right" }}>
                                    <th style={{ textAlign: "left", padding: "10px 18px" }}>METHOD</th>
                                    <th style={{ padding: "10px 12px" }}>TRANSACTIONS</th>
                                    <th style={{ padding: "10px 12px" }}>CORRECTED</th>
                                    <th style={{ padding: "10px 12px" }}>KEPT</th>
                                    <th style={{ padding: "10px 12px" }}>APPLIED TO SIMILAR</th>
                                    <th style={{ padding: "10px 18px" }}>CORRECTION RATE</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.methods.map(m => (
                                    <tr key={m.method} style={{ borderTop: "1px solid rgba(255,255,255,0.04)", textAlign: "right", color: "#e2e8f0" }}>
                                        <td style={{ textAlign: "left", padding: "10px 18px" }}>
                                            <div style={{ fontWeight: 600 }}>{METHOD_LABELS[m.method] || m.method}</div>
                                            <div style={{ fontSize: 10, color: faint }}>{m.method}</div>
                                        </td>
                                        <td style={{ padding: "10px 12px" }}>{n(m.transactions)}</td>
                                        <td style={{ padding: "10px 12px" }}>{n(m.corrected)}</td>
                                        <td style={{ padding: "10px 12px" }}>{n(m.confirmed)}</td>
                                        <td style={{ padding: "10px 12px" }}>{n(m.appliedToSimilar)}</td>
                                        <td style={{ padding: "10px 18px", fontWeight: 700, color: rateColor(m.correctionRate) }}>
                                            {m.correctionRate === null ? "—" : `${m.correctionRate}%`}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
