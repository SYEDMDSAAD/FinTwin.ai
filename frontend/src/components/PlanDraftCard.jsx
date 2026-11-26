import { useEffect, useState } from "react";
import { Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import toast from "react-hot-toast";
import API from "../services/api";
import { Card, Button, Badge } from "./ui";
import { storedUserIsDemo } from "../utils/demoGuard";

/* A plan drafted from the user's own transactions: their salary, and a
   budget per category from what it usually costs. Nothing is saved until
   the user taps "Use this plan"; every amount can be changed first. */

const rupees = (v) => `₹${Math.round(v || 0).toLocaleString("en-IN")}`;

function ordinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Lines worth showing: new categories, or a limit that differs from the suggestion. */
export function changedLines(budgets = []) {
    return budgets.filter((b) => b.currentLimit == null || Math.abs(b.currentLimit - b.suggested) >= 1);
}

export default function PlanDraftCard({ hasBudgets, onApplied }) {
    const [draft, setDraft] = useState(null);
    const [rows, setRows] = useState([]);
    // null until the user folds or unfolds it: open by default only for a first plan
    const [openChoice, setOpen] = useState(null);
    const [saving, setSaving] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const demo = storedUserIsDemo();

    useEffect(() => {
        let live = true;
        API.get("/plan/draft")
            .then(({ data }) => {
                if (!live || !data) return;
                setDraft(data);
                setRows(changedLines(data.budgets).map((b) => ({ ...b, keep: true, amount: String(b.suggested) })));
            })
            .catch(() => {});
        return () => { live = false; };
    }, []);

    const open = openChoice ?? !hasBudgets;
    if (!draft || dismissed || rows.length === 0) return null;

    const kept = rows.filter((r) => r.keep);
    const total = kept.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const salary = draft.salary;
    const share = salary?.typicalAmount ? Math.round((total / salary.typicalAmount) * 100) : null;
    const invalid = kept.some((r) => !(Number(r.amount) > 0));

    const update = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

    const apply = async () => {
        setSaving(true);
        try {
            const { data } = await API.post("/plan/budgets", {
                budgets: kept.map((r) => ({ category: r.category, limit: Number(r.amount) })),
            });
            const n = (data?.created || 0) + (data?.updated || 0);
            toast.success(n === 1 ? "1 budget saved" : `${n} budgets saved`);
            setDismissed(true);
            onApplied?.();
        } catch (e) {
            toast.error(e?.response?.data?.message || "Couldn't save the plan. Try again.");
        } finally {
            setSaving(false);
        }
    };

    const months = draft.monthsUsed === 1 ? "last month" : `the last ${draft.monthsUsed} months`;

    return (
        <Card tone="accent" className="mb-6">
            <div className="flex items-start gap-3">
                <div className="shrink-0 rounded-control bg-accent-soft p-2 text-accent">
                    <Sparkles size={20} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                    <h2 className="text-heading text-ink">
                        {hasBudgets ? "Suggested changes to your budgets" : "Your plan, drafted from your spending"}
                    </h2>
                    <p className="mt-1 text-small text-ink-2">
                        Based on {months}.{" "}
                        {salary && <>Salary of about {rupees(salary.typicalAmount)} from {salary.payer}, usually on the {ordinal(salary.typicalDay)}. </>}
                        Change any amount, or untick what you don't want.
                    </p>

                    {hasBudgets && (
                        <button
                            type="button"
                            className="mt-2 inline-flex items-center gap-1 text-small font-semibold text-accent"
                            onClick={() => setOpen(!open)}
                            aria-expanded={open}
                        >
                            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            {open ? "Hide" : `Review ${rows.length} suggestion${rows.length === 1 ? "" : "s"}`}
                        </button>
                    )}

                    {open && (
                        <>
                            <ul className="mt-3 divide-y divide-line">
                                {rows.map((r, i) => (
                                    <li key={r.category} className="flex items-center gap-3 py-2.5">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 accent-[var(--accent)]"
                                            checked={r.keep}
                                            onChange={(e) => update(i, { keep: e.target.checked })}
                                            aria-label={`Include ${r.category}`}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-body font-semibold text-ink">{r.category}</span>
                                                {r.essential && <Badge tone="info">Essential</Badge>}
                                                {r.currentLimit != null && (
                                                    <span className="text-caption text-ink-3">now {rupees(r.currentLimit)}</span>
                                                )}
                                            </div>
                                            <p className="text-caption text-ink-3">{r.reason}</p>
                                        </div>
                                        <label className="flex items-center gap-1 text-body text-ink">
                                            <span className="text-ink-3">₹</span>
                                            <input
                                                type="number"
                                                inputMode="numeric"
                                                min="1"
                                                step="100"
                                                className="w-24 rounded-control border border-line bg-surface-sunken px-2 py-1 text-right text-body text-ink"
                                                value={r.amount}
                                                disabled={!r.keep}
                                                onChange={(e) => update(i, { amount: e.target.value })}
                                                aria-label={`${r.category} budget`}
                                            />
                                        </label>
                                    </li>
                                ))}
                            </ul>

                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                <span className="text-small text-ink-2" role="status">
                                    {rupees(total)} a month{share != null && ` · ${share}% of your salary`}
                                </span>
                                {demo ? (
                                    <span className="text-small text-ink-3">Sign up to save a plan.</span>
                                ) : (
                                    <div className="flex gap-2">
                                        <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>Not now</Button>
                                        <Button size="sm" onClick={apply} disabled={saving || kept.length === 0 || invalid}>
                                            {saving ? "Saving…" : "Use this plan"}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </Card>
    );
}
