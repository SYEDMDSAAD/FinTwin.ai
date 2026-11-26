import { useCallback, useEffect, useState, useMemo } from "react";
import { X, Check, ChevronDown } from "lucide-react";
import { Button, SectionHeader } from "./ui";
import API from "../services/api";
import { EDIT_CATEGORIES } from "../constants/categories";
import CategoryDropdown from "./CategoryDropdown";
import { normalizeMerchant } from "../utils/merchant";

// Bank narrations look like "FT/DE/826585036398/Samiha R" — show the
// payee part when present (same rule as the transactions table).
function cleanMerchant(name) {
    if (!name) return "—";
    const parts = name.split("/");
    if (parts.length >= 4) return parts[3];
    return name;
}

// Months of history the grid covers. The heatmap is the one place that looks
// at everything imported — the rest of the app works on recent months — so the
// totals are summed on the server instead of shipping years of rows here.
const ALL_TIME = 0;

const monthLabel = (iso) => {
    if (!iso) return null;
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
};

function SpendingHeatmap({ onCategoryChanged }) {

    const [selectedCategory, setSelectedCategory] = useState(null);
    const [applySimilar, setApplySimilar] = useState(true);
    const [savingId, setSavingId] = useState(null);
    const [error, setError] = useState("");
    // Row switched to free-text mode: { id, value }
    const [customRow, setCustomRow] = useState(null);

    // =========================
    // Category Totals — every transaction the user has imported
    // =========================

    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);

    const loadTotals = useCallback(() =>
        API.get("/transactions/category-totals", { params: { months: ALL_TIME } })
            .then(r => setSummary(r.data))
            .catch(() => setError("Could not load your spending. Try again."))
            .finally(() => setLoading(false)), []);
    useEffect(() => { loadTotals(); }, [loadTotals]);

    const categoryTotals = useMemo(() => Object.fromEntries(
        (summary?.categories || []).map(c => [c.category, c.total])), [summary]);

    // =========================
    // Max Value
    // =========================

    const max = Math.max(

        ...Object.values(categoryTotals),

        1
    );

    // The clicked category's transactions, fetched when it's opened: over years
    // of history one category is still small, all of them together is not.
    const [selectedTxns, setSelectedTxns] = useState([]);
    const [loadingTxns, setLoadingTxns] = useState(false);

    useEffect(() => {
        if (!selectedCategory) return undefined;     // cleared in the click handler
        let alive = true;
        API.get("/transactions", { params: { months: ALL_TIME, category: selectedCategory } })
            .then(r => {
                if (!alive) return;
                setSelectedTxns((Array.isArray(r.data) ? r.data : [])
                    .filter(t => t.amount < 0)
                    // biggest spend first — the ones worth checking are at the top
                    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)));
            })
            .catch(() => { if (alive) setError("Could not load those transactions. Try again."); })
            .finally(() => { if (alive) setLoadingTxns(false); });
        return () => { alive = false; };
    }, [selectedCategory]);

    const editOptions = useMemo(() => {
        const present = new Set(Object.keys(categoryTotals));
        return [...new Set([...EDIT_CATEGORIES, ...present])];
    }, [categoryTotals]);

    const saveCategory = async (t, category) => {
        if (!category || category === t.category) return;
        try {
            setSavingId(t.id);
            setError("");
            await API.patch(`/transactions/${t.id}/category`, {
                category,
                applyToSimilar: applySimilar,
                remember: true,
            });
            setCustomRow(null);
            // The row just left this category — and with "apply to similar",
            // so did every other payment to the same payee
            const payee = normalizeMerchant(t.merchant);
            setSelectedTxns(rows => rows.filter(r => r.id !== t.id
                && !(applySimilar && normalizeMerchant(r.merchant) === payee)));
            loadTotals();
            onCategoryChanged?.({
                id: t.id,
                category,
                applyToSimilar: applySimilar,
                merchant: t.merchant,
            });
        } catch {
            setError("Could not save. Try again.");
        } finally {
            setSavingId(null);
        }
    };

    const open = (category, selected) => {
        setSelectedCategory(selected ? null : category);
        setSelectedTxns([]);
        setLoadingTxns(!selected);
        setCustomRow(null);
        setError("");
    };

    const drillDown = (
        <div className="bg-surface-sunken/60 border-t border-line">
            <div className="px-4 pt-3 pb-2 flex items-center gap-3">
                <span className="text-small text-ink-3">
                    {loadingTxns ? "Loading…" : `${selectedTxns.length} transaction${selectedTxns.length === 1 ? "" : "s"}`}
                </span>
                <button type="button" onClick={() => { setSelectedCategory(null); setSelectedTxns([]); }}
                        className="ml-auto w-8 h-8 -mr-1.5 rounded-full flex items-center justify-center text-ink-3 hover:bg-surface" aria-label="Close">
                    <X size={16} aria-hidden />
                </button>
            </div>
            <label className="px-4 pb-2 flex items-center gap-2 text-small text-ink-2 cursor-pointer w-fit">
                <input type="checkbox" checked={applySimilar} onChange={e => setApplySimilar(e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" />
                Also fix past payments to the same payee
            </label>
            {error && <p className="px-4 pb-2 text-small text-bad">{error}</p>}
            <ul className="max-h-80 overflow-y-auto divide-y divide-line border-t border-line">
                {selectedTxns.length === 0 && !loadingTxns && (
                    <li className="px-4 py-6 text-small text-ink-3 text-center">No transactions left in this category.</li>
                )}
                {selectedTxns.map(t => {
                    const saving = savingId === t.id;
                    const isCustom = customRow?.id === t.id;
                    return (
                        <li key={t.id} className="px-4 py-3">
                            <div className="flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="text-body text-ink truncate" title={t.merchant}>{cleanMerchant(t.merchant)}</div>
                                    <div className="text-small text-ink-3 num">{String(t.date).slice(0, 10)}</div>
                                </div>
                                <span className="text-body font-semibold text-ink num shrink-0">
                                    −₹{Math.abs(t.amount).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                </span>
                            </div>
                            <div className="mt-2">
                                {isCustom ? (
                                    <span className="flex items-center gap-2">
                                        <input
                                            autoFocus
                                            type="text"
                                            maxLength={40}
                                            placeholder="Type a category"
                                            value={customRow.value}
                                            onChange={e => setCustomRow({ id: t.id, value: e.target.value })}
                                            onKeyDown={e => { if (e.key === "Enter") saveCategory(t, customRow.value.trim()); }}
                                            disabled={saving}
                                            className="flex-1 min-w-0 h-10 rounded-control bg-surface border border-line px-3 text-body text-ink focus:outline-none focus:border-accent"
                                        />
                                        <Button size="sm" icon={Check} onClick={() => saveCategory(t, customRow.value.trim())} disabled={saving}>Save</Button>
                                        <Button size="sm" variant="ghost" onClick={() => setCustomRow(null)} disabled={saving}>Cancel</Button>
                                    </span>
                                ) : (
                                    <CategoryDropdown
                                        value={t.category || "Other"}
                                        options={editOptions}
                                        onSelect={c => saveCategory(t, c)}
                                        onCustomClick={() => setCustomRow({ id: t.id, value: "" })}
                                        disabled={saving}
                                    />
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );

    return (
        <section aria-label="Spending by category">
            <SectionHeader
                title="All-time spending by category"
                subtitle={summary?.from
                    ? `${monthLabel(summary.from)} – ${monthLabel(summary.to)} · ${summary.transactions.toLocaleString("en-IN")} transactions`
                    : "Everything you've imported"}
            />

            {loading && <p className="px-1 mb-3 text-small text-ink-3" role="status">Adding up your spending…</p>}
            {error && !selectedCategory && <p className="px-1 mb-3 text-small text-bad" role="alert">{error}</p>}
            {!loading && Object.keys(categoryTotals).length === 0 && (
                <p className="px-1 mb-3 text-small text-ink-3">No spending recorded yet.</p>
            )}

            {Object.keys(categoryTotals).length > 0 && (
                <ul className="rounded-card bg-surface border border-line divide-y divide-line overflow-hidden">
                    {Object.entries(categoryTotals)
                        .sort((a, b) => b[1] - a[1])
                        .map(([category, total]) => {
                            const selected = category === selectedCategory;
                            return (
                                <li key={category}>
                                    <button type="button" onClick={() => open(category, selected)} aria-expanded={selected}
                                            className="w-full px-4 py-3 text-left hover:bg-surface-hover">
                                        <span className="flex items-baseline justify-between gap-3">
                                            <span className="min-w-0 truncate text-body text-ink">{category}</span>
                                            <span className="flex items-center gap-1.5 shrink-0">
                                                <span className="text-body font-semibold text-ink num">₹{total.toLocaleString("en-IN")}</span>
                                                <ChevronDown size={16} aria-hidden className={`text-ink-3 transition-transform ${selected ? "rotate-180" : ""}`} />
                                            </span>
                                        </span>
                                        <span className="mt-2 mr-6 block h-1 rounded-full bg-surface-sunken overflow-hidden" aria-hidden>
                                            <span className="block h-full rounded-full bg-accent" style={{ width: `${(total / max) * 100}%` }} />
                                        </span>
                                    </button>
                                    {selected && drillDown}
                                </li>
                            );
                        })}
                </ul>
            )}
            <p className="mt-2 px-1 text-caption text-ink-3">Tap a category to see or fix its transactions.</p>
        </section>
    );
}

export default SpendingHeatmap;
