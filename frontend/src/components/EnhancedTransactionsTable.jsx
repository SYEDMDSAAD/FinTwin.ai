import { useState, useMemo, memo } from "react";
import { Download, SlidersHorizontal, X, Search, ChevronDown } from "lucide-react";

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
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10, padding: "8px 12px", color: "#fff", fontSize: 13,
  outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box",
};
const selectStyle = { ...inputStyle };

const EnhancedTransactionsTable = memo(function EnhancedTransactionsTable({ transactions = [] }) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [type, setType] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");
  const [showBalance, setShowBalance] = useState(true);

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

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);
  const totalIncome  = filtered.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
  const totalExpense = filtered.filter(t=>t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0);

  const activeFilters = [search, category!=="All", type!=="All", dateFrom, dateTo, minAmt, maxAmt].filter(Boolean).length;

  return (
    <div style={CARD}>
      <div style={{ position: "absolute", inset: "0 0 auto", height: 1, background: "linear-gradient(90deg,transparent,rgba(167,139,250,0.2),transparent)", borderRadius: 18 }} />

      {/* Header */}
      <div style={{ padding: "20px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-label)", letterSpacing: "0.12em", marginBottom: 2 }}>RECORDS</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary, #fff)", margin: 0 }}>Transactions</h2>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Summary chips */}
          <span style={{ fontSize: 11, fontWeight: 600, color: "#4ade80", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 8, padding: "4px 10px" }}>
            +₹{totalIncome.toLocaleString("en-IN", {maximumFractionDigits: 0})}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "4px 10px" }}>
            -₹{totalExpense.toLocaleString("en-IN", {maximumFractionDigits: 0})}
          </span>

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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, alignItems: "end" }}>
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
      <div style={{ display: "grid", gridTemplateColumns: showBalance ? "3fr 2fr 2fr 1.5fr 1.5fr" : "3fr 2fr 2fr 1.5fr", gap: 0, padding: "14px 24px 8px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
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
        {grouped.map(([key, display, txns]) => {
          const dayNet = txns.reduce((s,t) => s + t.amount, 0);
          return (
            <div key={key}>
              {/* Date group header */}
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 24px", background: "rgba(255,255,255,0.012)",
                borderBottom: "1px solid rgba(255,255,255,0.03)",
                borderTop: "1px solid rgba(255,255,255,0.03)",
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-label)", letterSpacing: "0.06em" }}>
                  {formatDate(key, display)}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: dayNet >= 0 ? "#4ade80" : "#f87171" }}>
                  {dayNet >= 0 ? "+" : ""}₹{Math.abs(dayNet).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
              </div>

              {/* Transactions for this date */}
              {txns.map(t => {
                const pos = t.amount > 0;
                const bal = withBalance[t.id];
                return (
                  <div
                    key={t.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: showBalance ? "3fr 2fr 2fr 1.5fr 1.5fr" : "3fr 2fr 2fr 1.5fr",
                      alignItems: "center",
                      padding: "12px 24px",
                      borderBottom: "1px solid rgba(255,255,255,0.025)",
                      transition: "background 0.15s",
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

                    {/* Category */}
                    <span style={{
                      display: "inline-block", fontSize: 11, fontWeight: 600,
                      padding: "3px 10px", borderRadius: 6, textAlign: "center", justifySelf: "center",
                      background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.15)",
                      color: "#a78bfa", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {t.category}
                    </span>

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
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: "12px 24px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--text-dimmer)" }}>{filtered.length} of {transactions.length} transactions</span>
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
