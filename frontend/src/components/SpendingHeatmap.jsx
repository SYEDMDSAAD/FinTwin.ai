import { useState, useMemo } from "react";
import { Hexagon, X, Check } from "lucide-react";
import API from "../services/api";
import { EDIT_CATEGORIES } from "../constants/categories";
import CategoryDropdown from "./CategoryDropdown";

// Bank narrations look like "FT/DE/826585036398/Samiha R" — show the
// payee part when present (same rule as the transactions table).
function cleanMerchant(name) {
    if (!name) return "—";
    const parts = name.split("/");
    if (parts.length >= 4) return parts[3];
    return name;
}

function SpendingHeatmap({ transactions, onCategoryChanged }) {

    const [selectedCategory, setSelectedCategory] = useState(null);
    const [applySimilar, setApplySimilar] = useState(true);
    const [savingId, setSavingId] = useState(null);
    const [error, setError] = useState("");
    // Row switched to free-text mode: { id, value }
    const [customRow, setCustomRow] = useState(null);

    // =========================
    // Category Totals
    // =========================

    const categoryTotals = {};

    transactions.forEach((t) => {

        // Only expenses

        if (t.amount < 0) {

            // Ignore invalid category

            const category =
                t.category || "Other";

            categoryTotals[category] =

                (categoryTotals[category] || 0)

                + Math.abs(t.amount);
        }
    });

    // =========================
    // Max Value
    // =========================

    const max = Math.max(

        ...Object.values(categoryTotals),

        1
    );

    // Transactions inside the clicked category (same period filter as the grid)
    const selectedTxns = useMemo(() => {
        if (!selectedCategory) return [];
        return transactions
            .filter(t => t.amount < 0 && (t.category || "Other") === selectedCategory)
            .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    }, [transactions, selectedCategory]);

    const editOptions = useMemo(() => {
        const present = new Set(transactions.map(t => t.category).filter(Boolean));
        return [...new Set([...EDIT_CATEGORIES, ...present])];
    }, [transactions]);

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

    return (

        <div
            className="
                p-7
                mb-8
                rounded-2xl
                border
                border-white/10
                bg-white/[0.03]
                backdrop-blur-xl
            "
        >

            {/* Header */}

            <div
                className="
                    flex
                    items-center
                    gap-3
                    mb-2
                "
            >

                <div
                    className="
                        w-10
                        h-10
                        rounded-xl
                        flex
                        items-center
                        justify-center
                        bg-cyan-500/10
                        border
                        border-cyan-500/20
                    "
                >
                    <Hexagon
                        size={18}
                        className="text-cyan-400"
                    />
                </div>

                <div>

                    <div
                        className="
                            text-[11px]
                            font-bold
                            tracking-[0.12em]
                            text-zinc-500
                        "
                    >
                        ANALYTICS
                    </div>

                    <h2
                        className="
                            text-lg
                            font-bold
                            text-white
                            mt-1
                        "
                    >
                        Spending Heatmap
                    </h2>

                </div>

                <div
                    className="
                        ml-auto
                        text-xs
                        text-zinc-500
                    "
                >
                    Expense intensity by category
                </div>

            </div>

            {/* Hint */}

            <p className="text-xs text-zinc-500 mb-6">
                Click a category to view or update its transactions for the selected period.
            </p>

            {/* Heatmap Grid */}

            <div className="
                grid
                grid-cols-1
                sm:grid-cols-2
                lg:grid-cols-3
                xl:grid-cols-4
                gap-3
            ">

                {Object.entries(categoryTotals)

                    .sort((a, b) => b[1] - a[1])

                    .map(([category, total]) => {

                        // =========================
                        // Opacity Control
                        // =========================

                        const intensity =
                            total / max;

                        const selected = category === selectedCategory;

                        return (

                            <button
                                key={category}
                                type="button"
                                onClick={() => {
                                    setSelectedCategory(selected ? null : category);
                                    setCustomRow(null);
                                    setError("");
                                }}
                                className={`
                                    relative
                                    overflow-hidden
                                    rounded-xl
                                    border
                                    p-5
                                    text-left
                                    cursor-pointer
                                    transition-all
                                    duration-300
                                    hover:-translate-y-1
                                    ${selected
                                        ? "border-purple-400/60 ring-1 ring-purple-400/40"
                                        : "border-white/10 hover:border-white/20"}
                                `}
                                style={{
                                    background: `rgba(167,139,250,${
                                        0.08 + intensity * 0.18
                                    })`
                                }}
                            >

                                <div
                                    className="
                                        absolute
                                        top-0
                                        left-0
                                        right-0
                                        h-[2px]
                                        bg-purple-400
                                    "
                                    style={{
                                        opacity:
                                            intensity * 0.8 + 0.2
                                    }}
                                />

                                {/* Category */}

                                <h3
                                    className="
                                        text-xs
                                        font-bold
                                        tracking-widest
                                        uppercase
                                        text-zinc-400
                                        mb-3
                                    "
                                >
                                    {category}
                                </h3>

                                {/* Amount */}

                                <p
                                    className="
                                        text-xl
                                        font-black
                                        text-white
                                        tabular-nums
                                    "
                                >

                                    ₹{
                                        total
                                            .toLocaleString("en-IN")
                                    }

                                </p>

                                {/* Small Label */}

                                <div
                                    className="
                                        mt-3
                                        h-1
                                        bg-white/10
                                        rounded-full
                                        overflow-hidden
                                    "
                                >
                                    <div
                                        className="
                                            h-full
                                            bg-purple-400
                                            rounded-full
                                        "
                                        style={{
                                            width: `${intensity * 100}%`
                                        }}
                                    />
                                </div>

                            </button>
                        );
                    })}

            </div>

            {/* Category drill-down panel */}

            {selectedCategory && (
                <div className="mt-5 rounded-xl border border-purple-400/25 bg-white/[0.02] overflow-hidden">

                    {/* Panel header */}
                    <div className="px-5 py-3 border-b border-white/10">
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-white">
                                {selectedCategory}
                            </span>
                            <span className="text-xs text-zinc-500">
                                {selectedTxns.length} transaction{selectedTxns.length === 1 ? "" : "s"} in selected period
                            </span>
                            <button
                                type="button"
                                onClick={() => setSelectedCategory(null)}
                                className="ml-auto p-1 rounded-md text-zinc-500 hover:text-white hover:bg-white/10"
                                title="Close"
                            >
                                <X size={14} />
                            </button>
                        </div>
                        <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400 cursor-pointer w-fit">
                            <input
                                type="checkbox"
                                checked={applySimilar}
                                onChange={e => setApplySimilar(e.target.checked)}
                                style={{ accentColor: "#a78bfa" }}
                            />
                            Also fix past transactions from the same payee
                        </label>
                    </div>

                    {error && (
                        <div className="px-5 py-2 text-xs text-red-400 border-b border-white/10">
                            {error}
                        </div>
                    )}

                    {/* Rows */}
                    <div className="max-h-72 overflow-y-auto">
                        {selectedTxns.length === 0 && (
                            <div className="px-5 py-6 text-xs text-zinc-500 text-center">
                                No transactions left in this category for the selected period.
                            </div>
                        )}
                        {selectedTxns.map(t => {
                            const saving = savingId === t.id;
                            const isCustom = customRow?.id === t.id;
                            return (
                                <div
                                    key={t.id}
                                    className="flex items-center gap-3 px-5 py-3 border-b border-white/5 hover:bg-white/[0.02]"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-white truncate" title={t.merchant}>
                                            {cleanMerchant(t.merchant)}
                                        </div>
                                        <div className="text-[11px] text-zinc-500 tabular-nums mt-0.5">
                                            {String(t.date).slice(0, 10)}
                                        </div>
                                    </div>
                                    <span className="text-sm font-bold text-red-400 tabular-nums shrink-0">
                                        -₹{Math.abs(t.amount).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                    </span>

                                    {isCustom ? (
                                        <span className="flex items-center gap-2 shrink-0">
                                            <input
                                                autoFocus
                                                type="text"
                                                maxLength={40}
                                                placeholder="Type a category…"
                                                value={customRow.value}
                                                onChange={e => setCustomRow({ id: t.id, value: e.target.value })}
                                                onKeyDown={e => { if (e.key === "Enter") saveCategory(t, customRow.value.trim()); }}
                                                disabled={saving}
                                                className="w-28 text-xs rounded-lg px-2 py-1.5 outline-none"
                                                style={{
                                                    background: "var(--bg-input)",
                                                    border: "1px solid var(--border-subtle)",
                                                    color: "var(--text-primary, #fff)",
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => saveCategory(t, customRow.value.trim())}
                                                disabled={saving}
                                                className="p-1.5 rounded-lg text-green-400 bg-green-400/10 border border-green-400/25"
                                                title="Save"
                                            >
                                                <Check size={12} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setCustomRow(null)}
                                                disabled={saving}
                                                className="p-1.5 rounded-lg text-zinc-400"
                                                style={{
                                                    background: "var(--bg-input)",
                                                    border: "1px solid var(--border-subtle)",
                                                }}
                                                title="Cancel"
                                            >
                                                <X size={12} />
                                            </button>
                                        </span>
                                    ) : (
                                        <div className="shrink-0 w-32">
                                            <CategoryDropdown
                                                value={t.category || "Other"}
                                                options={editOptions}
                                                onSelect={c => saveCategory(t, c)}
                                                onCustomClick={() => setCustomRow({ id: t.id, value: "" })}
                                                disabled={saving}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

        </div>
    );
}

export default SpendingHeatmap;
