import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import toast from "react-hot-toast";
import API from "../../services/api";

// Anonymised training data from users who opted in, as JSON-lines files.

const faint = "rgba(148,163,184,0.45)";
const muted = "rgba(148,163,184,0.6)";

const DATASETS = [
    ["categories", "Categorisation", "Each transaction's text, FinTwin's prediction and how it was made, and the final category"],
    ["copilot", "Copilot ratings", "Rated questions and answers, with the reason and how each answer was produced"],
    ["anomalies", "Anomaly verdicts", "Alerts confirmed or called false alarms, with the figures behind them"],
    ["imports", "Statement formats", "Header rows with the columns guessed and the columns used"],
];

export default function AdminTrainingExport() {
    const [counts, setCounts] = useState(null);
    const [busy, setBusy] = useState(null);

    const fetchCounts = useCallback(() =>
        API.get("/admin/training-export").then(r => setCounts(r.data)).catch(() => setCounts({})), []);
    useEffect(() => { fetchCounts(); }, [fetchCounts]);

    const download = async (dataset) => {
        setBusy(dataset);
        try {
            const r = await API.get(`/admin/training-export/${dataset}`, { responseType: "blob" });
            const url = URL.createObjectURL(r.data);
            const a = document.createElement("a");
            a.href = url;
            a.download = `fintwin-${dataset}-${new Date().toISOString().slice(0, 10)}.jsonl`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            toast.error("Export failed");
        } finally {
            setBusy(null);
        }
    };

    return (
        <section aria-label="Training data export" className="card" style={{ padding: 18, marginBottom: 28 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#e2e8f0" }}>Training data export</h2>
            <p style={{ margin: "4px 0 14px", fontSize: 11, color: muted, lineHeight: 1.6 }}>
                Only users who turned on "Help improve FinTwin's AI". People's names, phone numbers, UPI IDs, emails and
                account numbers are removed; users appear as a pseudonym. Setu sandbox and onboarding sample data are left out.
            </p>
            <div style={{ display: "grid", gap: 8 }}>
                {DATASETS.map(([id, label, desc]) => (
                    <div key={id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{label}</div>
                            <div style={{ fontSize: 11, color: faint }}>{desc}</div>
                        </div>
                        <span style={{ fontSize: 12, color: muted, width: 80, textAlign: "right" }}>
                            {counts ? `${counts[id] ?? 0} rows` : "—"}
                        </span>
                        <button className="ab ab-gray" disabled={busy === id} onClick={() => download(id)}
                                aria-label={`Download ${label}`} style={{ padding: "8px 13px" }}>
                            <Download size={12} /> {busy === id ? "Exporting…" : "JSONL"}
                        </button>
                    </div>
                ))}
            </div>
        </section>
    );
}
