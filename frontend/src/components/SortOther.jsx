import { useCallback, useEffect, useState } from "react";
import { Tags } from "lucide-react";
import toast from "react-hot-toast";
import API from "../services/api";
import { EDIT_CATEGORIES } from "../constants/categories";

// "Other" is where analysis goes to die: a budget, a trend or a recap can't
// say anything about money it can't place. This panel first re-runs the
// categorisation rules over old rows, then lists what's still unplaced by
// payee, biggest first — one choice sorts every payment to that payee and is
// remembered for the future.

const CHOICES = EDIT_CATEGORIES.filter(c => c !== "Other");
const inr = n => "₹" + Math.round(n).toLocaleString("en-IN");

export default function SortOther({ onChanged }) {
    const [groups, setGroups] = useState(null);
    const [busy, setBusy] = useState(null);
    const [expanded, setExpanded] = useState(false);

    const load = useCallback(() => API.get("/transactions/unsorted-payees", { params: { limit: 30 } })
        .then(res => setGroups(Array.isArray(res.data) ? res.data : []))
        .catch(() => setGroups([])), []);

    useEffect(() => {
        let alive = true;
        // Rows imported before the rules improved get sorted without a re-import
        API.post("/transactions/recategorize")
            .then(res => { if (alive && res.data?.updated > 0 && onChanged) onChanged(); })
            .catch(() => {})
            .finally(() => { if (alive) load(); });
        return () => { alive = false; };
    }, [load]); // eslint-disable-line react-hooks/exhaustive-deps -- run once on mount

    const sort = async (group, category) => {
        setBusy(group.sampleId);
        try {
            await API.patch(`/transactions/${group.sampleId}/category`,
                { category, applyToSimilar: true, remember: true });
            setGroups(gs => gs.filter(g => g.sampleId !== group.sampleId));
            toast.success(group.count > 1
                ? `${group.count} payments to ${group.payee} → ${category}, and future ones too`
                : `${group.payee} → ${category}, and future payments too`);
            if (onChanged) onChanged();
        } catch {
            toast.error("Couldn't update that payee. Try again.");
        } finally {
            setBusy(null);
        }
    };

    if (!groups || groups.length === 0) return null;

    const total = groups.reduce((s, g) => s + g.total, 0);
    const count = groups.reduce((s, g) => s + g.count, 0);
    const shown = expanded ? groups : groups.slice(0, 6);

    return (
        <section aria-label="Sort out Other" style={{ background: "var(--bg-card)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 16, padding: 18, margin: "16px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <Tags size={16} color="#fbbf24" aria-hidden />
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                    {inr(total)} in {count} {count === 1 ? "payment is" : "payments is"} still "Other"
                </h3>
            </div>
            <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                Pick a category for each payee. It applies to all their payments and to future ones, so your budgets and trends stay accurate.
            </p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                {shown.map(g => (
                    <li key={g.sampleId} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.payee}</div>
                            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                                {g.count} {g.count === 1 ? "payment" : "payments"} · {inr(g.total)}
                            </div>
                        </div>
                        <select
                            aria-label={`Category for ${g.payee}`}
                            defaultValue=""
                            disabled={busy === g.sampleId}
                            onChange={e => e.target.value && sort(g, e.target.value)}
                            style={{ flex: "0 0 160px", padding: "7px 10px", borderRadius: 10, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontFamily: "inherit" }}
                        >
                            <option value="">Choose category…</option>
                            {CHOICES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </li>
                ))}
            </ul>
            {groups.length > 6 && (
                <button type="button" onClick={() => setExpanded(x => !x)}
                        style={{ marginTop: 12, background: "none", border: "none", padding: 0, cursor: "pointer", color: "#a78bfa", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
                    {expanded ? "Show fewer" : `Show all ${groups.length} payees`}
                </button>
            )}
        </section>
    );
}
