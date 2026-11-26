import { useCallback, useEffect, useState } from "react";
import { Sparkles, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import API from "../services/api";
import { Button } from "./ui";
import { EDIT_CATEGORIES } from "../constants/categories";

// What FinTwin's sorting agent placed on its own after an import: payees the
// model was sure about. Nothing here is hidden — each payee shows the category
// it got, "These are right" confirms them all (and remembers them), and
// changing one moves every payment to that payee and teaches the right
// category for next time.

const CHOICES = EDIT_CATEGORIES.filter(c => c !== "Other");
const inr = n => "₹" + Math.round(n).toLocaleString("en-IN");

/** @param onChanged () — refresh the page's transactions after a correction */
export default function AutoSorted({ onChanged }) {
    const [groups, setGroups] = useState(null);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(null);

    const load = useCallback(() => API.get("/transactions/auto-sorted", { params: { limit: 30 } })
        .then(res => setGroups(Array.isArray(res.data) ? res.data : []))
        .catch(() => setGroups([])), []);

    useEffect(() => { load(); }, [load]);

    const confirmAll = async () => {
        setBusy("all");
        try {
            await API.post("/transactions/auto-sorted/confirm", { merchants: groups.map(g => g.merchant) });
            toast.success("Thanks. FinTwin will sort these payees the same way from now on.");
            setGroups([]);
        } catch {
            toast.error("Couldn't save that. Try again.");
        } finally {
            setBusy(null);
        }
    };

    const correct = async (group, category) => {
        setBusy(group.sampleId);
        try {
            await API.post("/transactions/auto-sorted/correct", { merchant: group.merchant, category });
            setGroups(gs => gs.filter(g => g.sampleId !== group.sampleId));
            toast.success(`${group.payee} → ${category}, and future payments too`);
            if (onChanged) onChanged();
        } catch {
            toast.error("Couldn't update that payee. Try again.");
        } finally {
            setBusy(null);
        }
    };

    if (!groups || groups.length === 0) return null;

    const count = groups.reduce((s, g) => s + g.count, 0);

    return (
        <section aria-label="Sorted by FinTwin" className="mb-6 rounded-card bg-surface border border-line">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                aria-controls="auto-sorted-list"
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
            >
                <span className="shrink-0 w-10 h-10 rounded-full bg-accent-soft text-accent flex items-center justify-center"><Sparkles size={18} aria-hidden /></span>
                <span className="min-w-0 flex-1">
                    <span className="block text-body text-ink">FinTwin sorted {count} {count === 1 ? "payment" : "payments"}</span>
                    <span className="block text-small text-ink-3">
                        {groups.length} {groups.length === 1 ? "payee" : "payees"} · check they look right
                    </span>
                </span>
                <ChevronDown size={18} aria-hidden className={`shrink-0 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && <div id="auto-sorted-list" className="border-t border-line">
                <p className="px-4 pt-3 text-small text-ink-3">
                    FinTwin placed these from the payee's name. Change any that are wrong.
                </p>
                <ul className="divide-y divide-line">
                    {groups.map(g => (
                        <li key={g.sampleId} className="px-4 py-3 flex items-center gap-3">
                            <span className="min-w-0 flex-1">
                                <span className="block text-body text-ink truncate">{g.payee}</span>
                                <span className="block text-small text-ink-3 num">{g.count} · {inr(g.total)}</span>
                            </span>
                            <select
                                aria-label={`Category for ${g.payee}`}
                                value={g.category}
                                disabled={busy !== null}
                                onChange={e => e.target.value !== g.category && correct(g, e.target.value)}
                                className="shrink-0 h-9 max-w-[45%] rounded-full bg-surface-sunken border border-transparent px-3 text-small text-ink"
                            >
                                {!CHOICES.includes(g.category) && <option value={g.category}>{g.category}</option>}
                                {CHOICES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </li>
                    ))}
                </ul>
                <div className="px-4 pb-4 pt-1">
                    <Button size="sm" onClick={confirmAll} disabled={busy !== null}>These are right</Button>
                </div>
            </div>}
        </section>
    );
}
