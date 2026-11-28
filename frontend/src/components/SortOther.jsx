import { useCallback, useEffect, useState } from "react";
import { Tags, ChevronDown, Sparkles, Check } from "lucide-react";
import toast from "react-hot-toast";
import API from "../services/api";
import { Button } from "./ui";
import { storedUserIsDemo } from "../utils/demoGuard";
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
        // The read-only demo can't change rows, so it only loads
        if (storedUserIsDemo()) {
            load();
            return () => { alive = false; };
        }
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
        <section aria-label="Sort out Other" className="mb-6 rounded-card bg-surface border border-line">
            <button
                type="button"
                onClick={toggleOpen}
                aria-expanded={open}
                aria-controls="sort-other-list"
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
            >
                <span className="shrink-0 w-10 h-10 rounded-full bg-warn-soft text-warn flex items-center justify-center"><Tags size={18} aria-hidden /></span>
                <span className="min-w-0 flex-1">
                    <span className="block text-body text-ink">{inr(total)} still in "Other"</span>
                    <span className="block text-small text-ink-3">
                        {count} {count === 1 ? "payment" : "payments"} · {groups.length} {groups.length === 1 ? "payee" : "payees"} to sort
                    </span>
                </span>
                <ChevronDown size={18} aria-hidden className={`shrink-0 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && <div id="sort-other-list" className="border-t border-line">
            <p className="px-4 pt-3 text-small text-ink-3">
                Pick a category for each payee. It applies to their past and future payments.
                {suggesting && <span role="status"> Getting suggestions…</span>}
            </p>
            <ul className="divide-y divide-line">
                {shown.map(g => {
                    const guess = suggestions?.[norm(g.merchant)];
                    return (
                    <li key={g.sampleId} className="px-4 py-3">
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="text-body text-ink truncate">{g.payee}</span>
                            <span className="text-small text-ink-3 num shrink-0">{g.count} · {inr(g.total)}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {guess && (
                                <button
                                    type="button"
                                    disabled={busy === g.sampleId}
                                    onClick={() => sort(g, guess)}
                                    aria-label={`Accept ${guess} for ${g.payee}`}
                                    title="FinTwin's guess from the payee's name"
                                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-accent-soft text-accent text-small font-medium disabled:opacity-50">
                                    <Sparkles size={14} aria-hidden /> {guess} <Check size={14} aria-hidden />
                                </button>
                            )}
                            <select
                                aria-label={`Category for ${g.payee}`}
                                defaultValue=""
                                disabled={busy === g.sampleId}
                                onChange={e => e.target.value && sort(g, e.target.value)}
                                className="h-9 rounded-full bg-surface-sunken border border-transparent px-3 text-small text-ink"
                            >
                                <option value="">{guess ? "Something else" : "Choose category"}</option>
                                {CHOICES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </li>
                    );
                })}
            </ul>
            {groups.length > 6 && (
                <div className="px-2 pb-2">
                    <Button variant="ghost" size="sm" onClick={() => setExpanded(x => !x)}>
                        {expanded ? "Show fewer" : `Show all ${groups.length} payees`}
                    </Button>
                </div>
            )}
            </div>}
        </section>
    );
}
