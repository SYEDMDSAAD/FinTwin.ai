import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import API from "../../services/api";

// Statement formats users imported, grouped by header row: how often the
// import page's column guess had to be fixed by hand. The ones at the top are
// where better automatic support would help most.

const faint = "rgba(148,163,184,0.45)";
const muted = "rgba(148,163,184,0.6)";
const rateColor = (r) => (r <= 10 ? "#4ade80" : r <= 40 ? "#fbbf24" : "#f87171");

const FIELD_ORDER = ["date", "merchant", "amount", "debit", "credit", "direction", "category", "balance", "debitCreditMode", "flipSign"];

function MappingDiff({ detected, used }) {
    const fields = FIELD_ORDER.filter(f => detected?.[f] !== undefined || used?.[f] !== undefined);
    return (
        <table style={{ fontSize: 11, borderCollapse: "collapse", color: "#cbd5e1" }}>
            <thead>
                <tr style={{ color: faint, textAlign: "left" }}>
                    <th style={{ padding: "4px 12px 4px 0" }}>FIELD</th>
                    <th style={{ padding: "4px 12px 4px 0" }}>GUESSED</th>
                    <th style={{ padding: "4px 0" }}>USED</th>
                </tr>
            </thead>
            <tbody>
                {fields.map(f => {
                    const g = detected?.[f] === undefined ? "—" : String(detected[f]);
                    const u = used?.[f] === undefined ? "—" : String(used[f]);
                    return (
                        <tr key={f} style={{ color: g === u ? "#cbd5e1" : "#fbbf24" }}>
                            <td style={{ padding: "3px 12px 3px 0", color: muted }}>{f}</td>
                            <td style={{ padding: "3px 12px 3px 0" }}>{g}</td>
                            <td style={{ padding: "3px 0" }}>{u}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

export default function AdminImportFormats() {
    const [formats, setFormats] = useState(null);
    const [open, setOpen] = useState(null);

    const fetchFormats = useCallback(() =>
        API.get("/admin/imports/formats")
            .then(r => setFormats(Array.isArray(r.data) ? r.data : []))
            .catch(() => toast.error("Couldn't load statement formats")), []);
    useEffect(() => { fetchFormats(); }, [fetchFormats]);

    return (
        <section aria-label="Statement formats" className="card" style={{ overflow: "hidden", marginBottom: 28 }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#e2e8f0" }}>Statement formats</h2>
                <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>
                    Grouped by header row. Fixed by hand = the user changed the columns the import page guessed.
                </div>
            </div>
            {!formats?.length ? (
                <div style={{ padding: 30, textAlign: "center", color: faint, fontSize: 12 }}>No statement imports yet.</div>
            ) : formats.map(f => (
                <div key={f.formatKey} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <button type="button" aria-expanded={open === f.formatKey} onClick={() => setOpen(open === f.formatKey ? null : f.formatKey)}
                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit", flexWrap: "wrap" }}>
                        {open === f.formatKey ? <ChevronDown size={14} color={muted} aria-hidden /> : <ChevronRight size={14} color={muted} aria-hidden />}
                        <span style={{ flex: "1 1 240px", minWidth: 0, fontSize: 12, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {(f.headers || []).join(" · ") || "(no headers)"}
                        </span>
                        <span className="badge b-cyan">{(f.fileType || "?").toUpperCase()}</span>
                        <span style={{ fontSize: 11, color: muted }}>{f.imports} imports · {f.users} users</span>
                        <span style={{ width: 120, textAlign: "right", fontSize: 12, fontWeight: 700, color: rateColor(f.fixRate) }}>
                            {f.fixedByHand} fixed ({f.fixRate}%)
                        </span>
                    </button>
                    {open === f.formatKey && (
                        <div style={{ padding: "0 18px 16px 42px" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: faint, letterSpacing: "0.08em", marginBottom: 6 }}>LATEST IMPORT</div>
                            <MappingDiff detected={f.lastDetected} used={f.lastFinal} />
                        </div>
                    )}
                </div>
            ))}
        </section>
    );
}
