import { useCallback, useEffect, useState } from "react";
import { Tags, ChevronDown, Sparkles, Check } from "lucide-react";
import toast from "react-hot-toast";
import API from "../services/api";
import { EDIT_CATEGORIES } from "../constants/categories";
import { normalizeMerchant as norm } from "../utils/merchant";

// "Other" is where analysis goes to die: a budget, a trend or a recap can't
// say anything about money it can't place. This panel first re-runs the
// categorisation rules over old rows, then lists what's still unplaced by
// payee, biggest first — one choice sorts every payment to that payee and is
// remembered for the future.
//
// Collapsed by default so it doesn't push the transactions down. Choosing a
// category updates the page in place (onSorted) — never a reload.

const CHOICES = EDIT_CATEGORIES.filter(c => c !== "Other");
const inr = n => "₹" + Math.round(n).toLocaleString("en-IN");


/**
 * @param onSorted      ({ id, category, applyToSimilar, merchant }) — patch the
 *                      page's transactions in place after one payee is sorted
 * @param onBulkChanged () — refresh quietly after the rules re-sorted old rows
 */
export default function SortOther({ onSorted, onBulkChanged }) {
    const [groups, setGroups] = useState(null);
    const [busy, setBusy] = useState(null);
    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState(false);
    // The local model's guesses, fetched the first time the panel opens
    const [suggestions, setSuggestions] = useState(null);   // null = not asked yet
    const [suggesting, setSuggesting] = useState(false);

    const askForSuggestions = useCallback(() => {
        setSuggesting(true);
        API.get("/transactions/unsorted-payees/suggestions", { params: { limit: 30 } })
            .then(res => setSuggestions(res.data?.suggestions || {}))
            .catch(() => setSuggestions({}))
            .finally(() => setSuggesting(false));
    }, []);

    const toggleOpen = () => {
        setOpen(o => !o);
        if (!open && suggestions === null && !suggesting) askForSuggestions();
    };

    const load = useCallback(() => API.get("/transactions/unsorted-payees", { params: { limit: 30 } })
        .then(res => setGroups(Array.isArray(res.data) ? res.data : []))
        .catch(() => setGroups([])), []);

    useEffect(() => {
        let alive = true;
        // Rows imported before the rules improved get sorted without a re-import
        API.post("/transactions/recategorize")
            .then(res => { if (alive && res.data?.updated > 0 && onBulkChanged) onBulkChanged(); })
            .catch(() => {})
            .finally(() => { if (alive) load(); });
        return () => { alive = false; };
    }, [load]); // eslint-disable-line react-hooks/exhaustive-deps -- run once on mount

    const sort = async (group, category) => {
        setBusy(group.sampleId);
        const suggested = suggestions?.[norm(group.merchant)];
        try {
            // Sending what was suggested records whether the model got it right
            await API.patch(`/transactions/${group.sampleId}/category`,
                { category, applyToSimilar: true, remember: true, ...(suggested ? { suggested } : {}) });
            setGroups(gs => gs.filter(g => g.sampleId !== group.sampleId));
            toast.success(group.count > 1
                ? `${group.count} payments to ${group.payee} → ${category}, and future ones too`
                : `${group.payee} → ${category}, and future payments too`);
            if (onSorted) onSorted({ id: group.sampleId, category, applyToSimilar: true, merchant: group.merchant });
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
        <section aria-label="Sort out Other" style={{ background: "var(--bg-card)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 16, padding: open ? 18 : "12px 18px", margin: "16px 0" }}>
            <button
                type="button"
                onClick={toggleOpen}
                aria-expanded={open}
                aria-controls="sort-other-list"
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
            >
                <Tags size={16} color="#fbbf24" aria-hidden />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                    {inr(total)} in {count} {count === 1 ? "payment is" : "payments is"} still "Other"
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                    {open ? "Hide" : `Sort ${groups.length} ${groups.length === 1 ? "payee" : "payees"}`}
                </span>
                <ChevronDown size={16} color="var(--text-secondary)" aria-hidden
                             style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
            </button>

            {open && <div id="sort-other-list" style={{ marginTop: 10 }}>
            <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                Pick a category for each payee. It applies to all their payments and to future ones, so your budgets and trends stay accurate.
                {suggesting && <span role="status"> Getting suggestions…</span>}
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
                        {suggestions?.[norm(g.merchant)] && (
                            <button
                                type="button"
                                disabled={busy === g.sampleId}
                                onClick={() => sort(g, suggestions[norm(g.merchant)])}
                                aria-label={`Accept ${suggestions[norm(g.merchant)]} for ${g.payee}`}
                                title="FinTwin's guess from the payee's name — check it before accepting"
                                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 10, border: "1px solid rgba(167,139,250,0.4)", background: "rgba(167,139,250,0.12)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600 }}>
                                <Sparkles size={12} color="#a78bfa" aria-hidden />
                                <span style={{ color: "var(--text-primary)" }}>{suggestions[norm(g.merchant)]}</span>
                                <Check size={13} color="#a78bfa" aria-hidden />
                            </button>
                        )}
                        <select
                            aria-label={`Category for ${g.payee}`}
                            defaultValue=""
                            disabled={busy === g.sampleId}
                            onChange={e => e.target.value && sort(g, e.target.value)}
                            style={{ flex: "0 0 160px", padding: "7px 10px", borderRadius: 10, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontFamily: "inherit" }}
                        >
                            <option value="">{suggestions?.[norm(g.merchant)] ? "Something else…" : "Choose category…"}</option>
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
            </div>}
        </section>
    );
}
