import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import API from "../../services/api";

// Anomaly alerts users confirmed ("Yes, that was odd") versus called false
// alarms ("Not an anomaly"), per kind of alert.

const faint = "rgba(148,163,184,0.45)";
const muted = "rgba(148,163,184,0.6)";
const TYPE_LABELS = {
    merchant_spike: "Merchant spike", category_spike: "Category surge", category_surge: "Category surge",
    large_transaction: "Large transaction", large_single: "Large transaction", burst: "Spending burst",
};
const rateColor = (r) => (r === null ? faint : r <= 20 ? "#4ade80" : r <= 50 ? "#fbbf24" : "#f87171");

export default function AdminAnomalyFeedback() {
    const [data, setData] = useState(null);

    const fetchStats = useCallback(() =>
        API.get("/admin/anomalies/feedback-stats")
            .then(r => setData(r.data))
            .catch(() => toast.error("Couldn't load anomaly feedback")), []);
    useEffect(() => { fetchStats(); }, [fetchStats]);

    return (
        <section aria-label="Anomaly alerts" className="card" style={{ padding: 18, marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 800, color: "#e2e8f0" }}>Anomaly alerts</h2>
                <span style={{ fontSize: 12, color: muted }}>
                    {data ? `${data.confirmed} confirmed · ${data.falseAlarms} false alarms` : "—"}
                    {data?.falseAlarmRate != null && (
                        <> · <strong style={{ color: rateColor(data.falseAlarmRate) }}>{data.falseAlarmRate}% false alarms</strong></>
                    )}
                </span>
            </div>
            {!data?.byType?.length ? (
                <div style={{ fontSize: 12, color: faint }}>No verdicts yet. They appear when users mark alerts "Yes, that was odd" or "Not an anomaly".</div>
            ) : data.byType.map(t => (
                <div key={t.type} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", fontSize: 12, color: "#e2e8f0" }}>
                    <span style={{ flex: 1 }}>{TYPE_LABELS[t.type] || t.type}</span>
                    <span style={{ color: muted }}>✓ {t.confirmed} · ✗ {t.falseAlarms}</span>
                    <span style={{ width: 110, textAlign: "right", fontWeight: 700, color: rateColor(t.falseAlarmRate) }}>{t.falseAlarmRate}% false</span>
                </div>
            ))}
        </section>
    );
}
