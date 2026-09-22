import { useState, useMemo, useEffect, memo, Fragment } from "react";
import { Download, SlidersHorizontal, X, Search, Check, Pencil } from "lucide-react";
import API from "../services/api";
import { EDIT_CATEGORIES } from "../constants/categories";
import CategoryDropdown from "./CategoryDropdown";

const CATEGORIES = [
  "Food & Drinks","Shopping","Housing","Transportation","Vehicle",
  "Life & Entertainment","Communication/PC","Financial Expenses",
  "Investments","Others","Unknown","Income","Salary",
];

// Normalises any date string to "YYYY-MM-DD" for reliable sorting and filtering.
// Handles "YYYY-MM-DD" (onboarding/manual) and "DD/MM/YYYY" (bank sync).
function toSortableDate(dateStr) {
  if (!dateStr) return "";
  const s = String(dateStr).slice(0, 10);
  if (s[2] === "/") {
    // DD/MM/YYYY
    const [d, m, y] = s.split("/");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return s; // already YYYY-MM-DD
}

function exportCSV(transactions) {
  const header = ["Date","Merchant","Category","Amount","Balance"];
  let running = 0;
  const sorted = [...transactions].sort((a, b) => toSortableDate(a.date).localeCompare(toSortableDate(b.date)));
  const rows = sorted.map(t => {
    running += t.amount;
    return [t.date, `"${t.merchant}"`, t.category, t.amount, running.toFixed(2)];
  });
  const csv = [header, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "fintwin_transactions.csv"; a.click();
  URL.revokeObjectURL(url);
}

function cleanMerchant(name) {
  if (!name) return "—";
  const parts = name.split("/");
  if (parts.length >= 4) return parts[3];
  return name;
}

function groupByDate(transactions) {
  const groups = {};
  transactions.forEach(t => {
    // Use the sortable (YYYY-MM-DD) form as the group key so ordering is correct,
    // but store the original string too so we can display it properly.
    const key = toSortableDate(t.date) || "Unknown";
    if (!groups[key]) groups[key] = { display: t.date?.slice(0, 10) || "Unknown", txns: [] };
    groups[key].txns.push(t);
  });
  // Sort group keys (YYYY-MM-DD) descending → newest first
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, { display, txns }]) => [key, display, txns]);
}

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// Groups date-groups into months, newest first:
// [monthKey, monthLabel, monthNet, dayGroups]
function groupByMonth(dayGroups) {
  const months = {};
  dayGroups.forEach(([key, display, txns]) => {
    const monthKey = key.slice(0, 7); // YYYY-MM
    if (!months[monthKey]) months[monthKey] = { dayGroups: [], net: 0 };
    months[monthKey].dayGroups.push([key, display, txns]);
    months[monthKey].net += txns.reduce((s, t) => s + t.amount, 0);
  });
  return Object.entries(months)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, { dayGroups: dg, net }]) => {
      const [y, m] = monthKey.split("-").map(Number);
      const label = y && m ? `${MONTH_NAMES[m - 1]} ${y}` : monthKey;
      return [monthKey, label, net, dg];
    });
}

function formatDate(sortableKey, originalDisplay) {
  // sortableKey is always YYYY-MM-DD; parse as UTC to avoid timezone shift
  const [y, m, d] = sortableKey.split("-").map(Number);
  if (!y || !m || !d) return originalDisplay || sortableKey;
  const dt = new Date(y, m - 1, d); // local date, no timezone shift
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (dt.toDateString() === today.toDateString()) return "Today";
  if (dt.toDateString() === yesterday.toDateString()) return "Yesterday";
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const CARD = { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18 };
const inputStyle = {
  background: "var(--bg-input)", border: "1px solid var(--border-subtle)",
  borderRadius: 10, padding: "8px 12px", color: "var(--text-primary, #fff)", fontSize: 13,
  outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box",
};
const selectStyle = { ...inputStyle };

// How far back to ask the server for. "Everything" can be years of rows, so
// the list renders a chunk at a time — 10,000 rows in the DOM at once locks
// the page up for seconds.
const RANGES = [[3, "3 months"], [6, "6 months"], [12, "1 year"], [24, "2 years"], [0, "Everything"]];
const CHUNK = 300;

const EnhancedTransactionsTable = memo(function EnhancedTransactionsTable({
  transactions = [], onChanged, months, onMonthsChange, chunkSize = CHUNK,
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [type, setType] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");
  const [showBalance, setShowBalance] = useState(true);

  // ── Inline category editing ──
  const CUSTOM = "__custom__";
  const [editingId, setEditingId] = useState(null);
  const [editCategory, setEditCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [applySimilar, setApplySimilar] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const editOptions = useMemo(() => {
    const present = new Set(transactions.map(t => t.category).filter(Boolean));
    return [...new Set([...EDIT_CATEGORIES, ...present])];
  }, [transactions]);

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditCategory(t.category || "Other");
    setCustomCategory("");
    setApplySimilar(true);
    setEditError("");
  };

  const cancelEdit = () => { setEditingId(null); setEditError(""); };

  const saveCategory = async (t) => {
    const category = editCategory === CUSTOM
      ? customCategory.trim()
      : editCategory;
    if (editCategory === CUSTOM && !category) {
      setEditError("Type a category name first.");
      return;
    }
    if (!category || category === t.category) { cancelEdit(); return; }
    try {
      setSaving(true);
      setEditError("");
      await API.patch(`/transactions/${t.id}/category`, {
        category,
        applyToSimilar: applySimilar,
        remember: true,
      });
      setEditingId(null);
      // Report what changed so the parent can patch its state in place —
      // a full refetch here would flash the loading skeleton over the table.
      onChanged?.({
        id: t.id,
        category,
        applyToSimilar: applySimilar,
        merchant: t.merchant,
      });
    } catch {
      setEditError("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => { setSearch(""); setCategory("All"); setType("All"); setDateFrom(""); setDateTo(""); setMinAmt(""); setMaxAmt(""); };

  const filtered = useMemo(() => {
    return [...transactions]
      .filter(t => {
        if (search && !t.merchant?.toLowerCase().includes(search.toLowerCase()) && !t.category?.toLowerCase().includes(search.toLowerCase())) return false;
        if (category !== "All" && t.category !== category) return false;
        if (type === "Income" && t.amount <= 0) return false;
        if (type === "Expense" && t.amount >= 0) return false;
        // Normalise to YYYY-MM-DD before comparing with date-picker values
        const txDate = toSortableDate(t.date);
        if (dateFrom && txDate < dateFrom) return false;
        if (dateTo   && txDate > dateTo)   return false;
        if (minAmt && Math.abs(t.amount) < parseFloat(minAmt)) return false;
        if (maxAmt && Math.abs(t.amount) > parseFloat(maxAmt)) return false;
        return true;
      })
      .sort((a, b) => toSortableDate(b.date).localeCompare(toSortableDate(a.date)));
  }, [transactions, search, category, type, dateFrom, dateTo, minAmt, maxAmt]);

  // running balance (chronological)
  const withBalance = useMemo(() => {
    const chrono = [...filtered].sort((a, b) => toSortableDate(a.date).localeCompare(toSortableDate(b.date)));
    let bal = 0;
    const balMap = {};
    chrono.forEach(t => { bal += t.amount; balMap[t.id] = Math.round(bal * 100) / 100; });
    return balMap;
  }, [filtered]);

  const renderCategoryChip = (t) => (
    <button
      onClick={() => startEdit(t)}
      title="Edit category"
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        gap: 5, fontSize: 11, fontWeight: 600,
        padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
        background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.15)",
        color: "#a78bfa", width: 130, whiteSpace: "nowrap", boxSizing: "border-box",
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.category}</span>
      <Pencil size={9} style={{ opacity: 0.55, flexShrink: 0 }} />
    </button>
  );

  const renderCategoryEditor = (t) => (
    <div style={{
      display: "flex", flexDirection: "column", gap: 7, minWidth: 170, maxWidth: 210,
      padding: 10, borderRadius: 10,
      background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.18)",
    }}>
      <CategoryDropdown
        value={editCategory === CUSTOM ? "＋ Custom…" : editCategory}
        options={editOptions}
        onSelect={c => setEditCategory(c)}
        onCustomClick={() => setEditCategory(CUSTOM)}
        disabled={saving}
      />
      {editCategory === CUSTOM && (
        <input
          autoFocus
          type="text"
          placeholder="Type a category…"
          maxLength={40}
          value={customCategory}
          onChange={e => setCustomCategory(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") saveCategory(t); }}
          style={{ ...inputStyle, fontSize: 12, padding: "5px 8px" }}
        />
      )}
      <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--text-dim)", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={applySimilar}
          onChange={e => setApplySimilar(e.target.checked)}
          style={{ accentColor: "#a78bfa" }}
        />
        Also fix past transactions from this payee
      </label>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={() => saveCategory(t)}
          disabled={saving}
          style={{
            display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
            borderRadius: 7, cursor: saving ? "wait" : "pointer", fontFamily: "inherit",
            background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)",
            color: "#4ade80", fontSize: 11, fontWeight: 600, opacity: saving ? 0.6 : 1,
          }}
        >
          <Check size={11} /> {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={cancelEdit}
          disabled={saving}
          style={{
            display: "flex", alignItems: "center", padding: "4px 10px",
            borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
            background: "var(--bg-input)", border: "1px solid var(--border-subtle)",
            color: "var(--text-muted)", fontSize: 11,
          }}
        >
          <X size={11} />
        </button>
      </div>
      {editError && <span style={{ fontSize: 10, color: "#f87171" }}>{editError}</span>}
    </div>
  );

  // Reset the rendered chunk whenever what's being shown changes
  const [shown, setShown] = useState(chunkSize);
  useEffect(() => { setShown(chunkSize); }, [chunkSize, transactions, search, category, type, dateFrom, dateTo, minAmt, maxAmt]);

  const visible = filtered.length > shown ? filtered.slice(0, shown) : filtered;
  const grouped = useMemo(() => groupByMonth(groupByDate(visible)), [visible]);
  const totalIncome  = filtered.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
  const totalExpense = filtered.filter(t=>t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0);

  const activeFilters = [search, category!=="All", type!=="All", dateFrom, dateTo, minAmt, maxAmt].filter(Boolean).length;

  return (
    <div style={CARD}>
      <style>{`
        .tx-row-grid { display: grid; gap: 0; }
        .tx-col-headers { display: grid; grid-template-columns: 3fr 2fr 2fr 1.5fr; padding: 8px 24px; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .tx-row-desktop { display: grid; grid-template-columns: 3fr 2fr 2fr 1.5fr; align-items: center; padding: 12px 24px; border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.15s; }
        .tx-row-desktop.balance { grid-template-columns: 3fr 2fr 2fr 1.5fr 1.5fr; }
        .tx-mobile-card { display: none; padding: 10px 16px; border-bottom: 1px dashed rgba(255,255,255,0.06); }
        .tx-filter-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; margin-bottom: 10px; }
        .tx-amount-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; align-items: end; }
        @media (max-width: 640px) {
          .tx-row-desktop { display: none !important; }
          .tx-col-headers { display: none !important; }
          .tx-mobile-card { display: flex; flex-direction: column; gap: 6px; }
          .tx-filter-grid { grid-template-columns: 1fr 1fr; }
          .tx-amount-grid { grid-template-columns: 1fr 1fr; gap: 12px 10px; }
          .tx-header-wrap { flex-wrap: wrap; gap: 8px; }
          .tx-export-btn { display: none; }
        }
      `}</style>
      <div style={{ position: "absolute", inset: "0 0 auto", height: 1, background: "linear-gradient(90deg,transparent,rgba(167,139,250,0.2),transparent)", borderRadius: 18 }} />

      {/* Header */}
      <div style={{ padding: "20px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-label)", letterSpacing: "0.12em", marginBottom: 2 }}>RECORDS</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary, #fff)", margin: 0 }}>Transactions</h2>
        </div>
        <div className="tx-header-wrap" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Summary chips */}
          <span style={{ fontSize: 11, fontWeight: 600, color: "#4ade80", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 8, padding: "4px 10px" }}>
            +₹{totalIncome.toLocaleString("en-IN", {maximumFractionDigits: 0})}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "4px 10px" }}>
            -₹{totalExpense.toLocaleString("en-IN", {maximumFractionDigits: 0})}
          </span>

          {onMonthsChange && (
            <select
              aria-label="How far back to show"
              value={months}
              onChange={e => onMonthsChange(Number(e.target.value))}
              style={{ padding: "7px 10px", borderRadius: 10, background: "var(--bg-input)", border: "1px solid var(--border-card)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}
            >
              {RANGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          )}

          <button
            onClick={() => setFiltersOpen(o => !o)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 12px", borderRadius: 10, cursor: "pointer",
              background: filtersOpen ? "rgba(167,139,250,0.12)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${activeFilters > 0 ? "rgba(167,139,250,0.4)" : "rgba(255,255,255,0.08)"}`,
              color: activeFilters > 0 ? "#a78bfa" : "var(--text-muted)",
              fontSize: 12, fontWeight: 600, fontFamily: "inherit",
            }}
          >
            <SlidersHorizontal size={13} />
            Filters {activeFilters > 0 ? `(${activeFilters})` : ""}
          </button>
          {activeFilters > 0 && (
            <button
              onClick={reset}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "7px 12px", borderRadius: 10, cursor: "pointer",
                background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)",
                color: "#f87171", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
              }}
            >
              <X size={12} /> Reset
            </button>
          )}
          <button
            onClick={() => exportCSV(filtered)}
            className="tx-export-btn"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 12px", borderRadius: 10, cursor: "pointer",
              background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.2)",
              color: "#22d3ee", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
            }}
          >
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {filtersOpen && (
        <div style={{ margin: "16px 24px 0", padding: 16, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14 }}>
          <div className="tx-filter-grid">
            <div>
              <label style={lbl}>Search</label>
              <div style={{ position: "relative" }}>
                <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }} />
                <input style={{ ...inputStyle, paddingLeft: 28 }} placeholder="Merchant or category..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <div>
              <label style={lbl}>Category</label>
              <select style={selectStyle} value={category} onChange={e => setCategory(e.target.value)}>
                <option value="All">All categories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Type</label>
              <select style={selectStyle} value={type} onChange={e => setType(e.target.value)}>
                <option value="All">All types</option>
                <option value="Income">Income</option>
                <option value="Expense">Expense</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Running Balance</label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 8 }}>
                <input type="checkbox" checked={showBalance} onChange={e => setShowBalance(e.target.checked)} style={{ accentColor: "#a78bfa" }} />
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Show balance column</span>
              </label>
            </div>
          </div>
          <div className="tx-amount-grid">
            <div>
              <label style={lbl}>Date from</label>
              <input type="date" style={inputStyle} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Date to</label>
              <input type="date" style={inputStyle} value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Min amount (₹)</label>
              <input type="number" style={inputStyle} placeholder="0" value={minAmt} onChange={e => setMinAmt(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Max amount (₹)</label>
              <input type="number" style={inputStyle} placeholder="∞" value={maxAmt} onChange={e => setMaxAmt(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={reset}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "6px 14px", borderRadius: 8, cursor: "pointer",
                background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)",
                color: "#f87171", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
              }}
            >
              <X size={12} /> Reset all filters
            </button>
          </div>
        </div>
      )}

      {/* Column headers */}
      <div className="tx-col-headers" style={{ gap: 0, padding: "14px 24px 8px", gridTemplateColumns: showBalance ? "3fr 2fr 2fr 1.5fr 1.5fr" : "3fr 2fr 2fr 1.5fr" }}>
        {["Merchant","Category","Date","Amount", showBalance && "Balance"].filter(Boolean).map(h => (
          <span key={h} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.12em", textAlign: h === "Amount" || h === "Balance" ? "right" : h === "Category" ? "center" : "left" }}>{h}</span>
        ))}
      </div>

      {/* Grouped rows */}
      <div style={{ maxHeight: 600, overflowY: "auto" }}>
        {grouped.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text-dimmer)", fontSize: 13 }}>
            No transactions match your filters.
          </div>
        )}
        {grouped.map(([monthKey, monthLabel, monthNet, dayGroups]) => (
          <div key={monthKey}>
            {/* Month band — the only tally shown */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 24px",
              background: "rgba(167,139,250,0.06)",
              borderTop: "1px solid rgba(167,139,250,0.12)",
              borderBottom: "1px solid rgba(167,139,250,0.12)",
              position: "sticky", top: 0, zIndex: 1,
              backdropFilter: "blur(8px)",
            }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-primary, #fff)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {monthLabel}
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: monthNet >= 0 ? "#4ade80" : "#f87171", fontVariantNumeric: "tabular-nums" }}>
                {monthNet >= 0 ? "+" : "-"}₹{Math.abs(monthNet).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </span>
            </div>

            {dayGroups.map(([key, display, txns]) => (
            <div key={key}>
              {/* Date group header — label only, no per-day tally */}
              <div style={{
                padding: "7px 24px", background: "rgba(255,255,255,0.012)",
                borderBottom: "1px solid rgba(255,255,255,0.03)",
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-label)", letterSpacing: "0.06em" }}>
                  {formatDate(key, display)}
                </span>
              </div>

              {/* Transactions for this date */}
              {txns.map(t => {
                const pos = t.amount > 0;
                const bal = withBalance[t.id];
                return (
                  <Fragment key={t.id}>
                  <div
                    className={`tx-row-desktop${showBalance ? " balance" : ""}`}
                    style={{
                      cursor: "default",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    {/* Merchant */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                        background: pos ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                        border: `1px solid ${pos ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 13, color: pos ? "#4ade80" : "#f87171",
                      }}>
                        {pos ? "↓" : "↑"}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary, #fff)" }}>{t.merchant}</span>
                    </div>

                    {/* Category — click to edit; correction is remembered per payee */}
                    <div style={{ justifySelf: "center" }}>
                      {editingId === t.id ? renderCategoryEditor(t) : renderCategoryChip(t)}
                    </div>

                    {/* Date */}
                    <span style={{ fontSize: 12, color: "var(--text-label)", fontVariantNumeric: "tabular-nums" }}>
                      {t.date}
                    </span>

                    {/* Amount */}
                    <span style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: pos ? "#4ade80" : "#f87171", fontVariantNumeric: "tabular-nums" }}>
                      {pos ? "+" : "-"}₹{Math.abs(t.amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </span>

                    {/* Running balance */}
                    {showBalance && (
                      <span style={{ textAlign: "right", fontSize: 12, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
                        ₹{(bal ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </span>
                    )}
                  </div>

                  {/* Mobile card layout */}
                  <div className="tx-mobile-card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: pos ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)", border: `1px solid ${pos ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: pos ? "#4ade80" : "#f87171" }}>
                          {pos ? "↓" : "↑"}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary, #fff)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "160px" }}>{cleanMerchant(t.merchant)}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: pos ? "#4ade80" : "#f87171", flexShrink: 0, marginLeft: 8 }}>
                        {pos ? "+" : "-"}₹{Math.abs(t.amount).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingLeft: 36 }}>
                      {editingId === t.id ? renderCategoryEditor(t) : (
                        <button
                          onClick={() => startEdit(t)}
                          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 10, fontWeight: 600, color: "#a78bfa", background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 6, padding: "2px 6px", cursor: "pointer", fontFamily: "inherit", width: 110, whiteSpace: "nowrap", overflow: "hidden", boxSizing: "border-box" }}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.category}</span> <Pencil size={8} style={{ opacity: 0.55, flexShrink: 0 }} />
                        </button>
                      )}
                      <span style={{ fontSize: 11, color: "var(--text-label)" }}>{t.date}</span>
                    </div>
                  </div>
                  </Fragment>
                );
              })}
            </div>
            ))}
          </div>
        ))}

        {filtered.length > shown && (
          <div style={{ padding: "14px 24px", textAlign: "center" }}>
            <button
              onClick={() => setShown(n => n + chunkSize)}
              style={{ padding: "8px 16px", borderRadius: 10, background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)", color: "#a78bfa", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
            >
              Show more ({filtered.length - shown} older)
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: "12px 24px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--text-dimmer)" }}>
          Showing {Math.min(shown, filtered.length)} of {filtered.length}
          {filtered.length !== transactions.length && ` (filtered from ${transactions.length})`}
        </span>
        <button
          onClick={() => exportCSV(filtered)}
          style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
        >
          <Download size={11} /> Download as CSV
        </button>
      </div>
    </div>
  );
});

export default EnhancedTransactionsTable;

const lbl = { display: "block", fontSize: 10, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em", marginBottom: 5 };
