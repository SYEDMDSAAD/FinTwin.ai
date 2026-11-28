import { useState, useMemo, memo } from "react";
import { Download, SlidersHorizontal, X, Search, Check } from "lucide-react";
import API from "../services/api";
import { EDIT_CATEGORIES } from "../constants/categories";
import CategoryDropdown from "./CategoryDropdown";
import SpendGuardTxTag from "./SpendGuardTxTag";
import { Button } from "./ui";

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
  return softenCaps(parts.length >= 4 ? parts[3] : name);
}

// Bank feeds shout: "ACME PVT LTD" reads better as "Acme Pvt Ltd". Only names
// with no lower-case letters change; known acronyms (HDFC, UPI) and two-letter
// words stay in capitals.
const ACRONYMS = new Set(("HDFC ICICI SBI UPI LIC IRCTC ATM EMI NEFT IMPS RTGS NACH ECS POS ACH BSES KFC IGL BESCOM " +
  "TNEB LPG CRED OTT IDFC HSBC BOB PNB RBL GST ITC BMTC DMRC BSNL MTNL JIO NSE BSE SIP ETF PPF NPS EPF ELSS " +
  "IOB UCO CSB DCB YES KVB TMB AXIS").split(" ").filter(w => w !== "YES" && w !== "AXIS"));
export function softenCaps(name) {
  if (!name || /[a-z]/.test(name)) return name;
  return name.replace(/[A-Z][A-Z']*/g, w => (w.length <= 2 || ACRONYMS.has(w) ? w : w[0] + w.slice(1).toLowerCase()));
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

// How far back to ask the server for. "Everything" can be years of rows, so
// the list renders a chunk at a time — 10,000 rows in the DOM at once locks
// the page up for seconds.
const RANGES = [[3, "3 months"], [6, "6 months"], [12, "1 year"], [24, "2 years"], [0, "Everything"]];
const CHUNK = 300;

const EnhancedTransactionsTable = memo(function EnhancedTransactionsTable({
  transactions = [], onChanged, onReload, months, onMonthsChange, chunkSize = CHUNK,
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [type, setType] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");

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

  const renderCategoryEditor = (t) => (
    <div className="mt-2 ml-[52px] mr-1 p-3 rounded-control bg-surface-sunken space-y-2.5">
      <CategoryDropdown
        value={editCategory === CUSTOM ? "Custom category…" : editCategory}
        options={editOptions}
        onSelect={c => setEditCategory(c)}
        onCustomClick={() => setEditCategory(CUSTOM)}
        disabled={saving}
      />
      {editCategory === CUSTOM && (
        <input
          autoFocus
          type="text"
          placeholder="Type a category"
          maxLength={40}
          value={customCategory}
          onChange={e => setCustomCategory(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") saveCategory(t); }}
          className={INPUT}
        />
      )}
      <label className="flex items-center gap-2 text-small text-ink-2 cursor-pointer">
        <input type="checkbox" checked={applySimilar} onChange={e => setApplySimilar(e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" />
        Also fix past payments to this payee
      </label>
      <div className="flex gap-2">
        <Button size="sm" icon={Check} onClick={() => saveCategory(t)} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}>Cancel</Button>
      </div>
      {editError && <p className="text-small text-bad">{editError}</p>}
    </div>
  );

  // Reset the rendered chunk whenever what's being shown changes: the count
  // belongs to one set of filters, and a new set starts from one chunk again
  const viewKey = [chunkSize, transactions.length, transactions[0]?.id, search, category, type, dateFrom, dateTo, minAmt, maxAmt].join("|");
  const [chunk, setChunk] = useState({ key: null, n: chunkSize });
  const shown = chunk.key === viewKey ? chunk.n : chunkSize;
  const setShown = (f) => setChunk({ key: viewKey, n: f(shown) });

  const visible = filtered.length > shown ? filtered.slice(0, shown) : filtered;
  const grouped = useMemo(() => groupByMonth(groupByDate(visible)), [visible]);
  const totalIncome  = filtered.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
  const totalExpense = filtered.filter(t=>t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0);

  const activeFilters = [search, category!=="All", type!=="All", dateFrom, dateTo, minAmt, maxAmt].filter(Boolean).length;

  const money = (v, digits = 0) => `₹${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: digits })}`;

  return (
    <section aria-label="Transactions">
      {/* Controls, then the totals for what's shown */}
      <div className="flex items-center gap-2 mb-2 px-1">
        {onMonthsChange && (
          <select aria-label="How far back to show" value={months} onChange={e => onMonthsChange(Number(e.target.value))}
                  className="h-9 rounded-full bg-surface border border-line px-3 text-small font-medium text-ink">
            {RANGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        )}
        <Button variant={activeFilters ? "soft" : "secondary"} size="sm" icon={SlidersHorizontal} onClick={() => setFiltersOpen(o => !o)} aria-expanded={filtersOpen}>
          Filter{activeFilters ? ` (${activeFilters})` : ""}
        </Button>
        <button type="button" onClick={() => exportCSV(filtered)} aria-label="Download as CSV"
                className="ml-auto w-9 h-9 rounded-full flex items-center justify-center text-ink-2 hover:bg-surface">
          <Download size={16} aria-hidden />
        </button>
      </div>
      <p className="mb-4 px-1 text-small text-ink-3">
        In <span className="text-good font-semibold num">{money(totalIncome)}</span>
        <span className="mx-1.5">·</span>
        Out <span className="text-ink font-semibold num">{money(totalExpense)}</span>
      </p>

      {filtersOpen && (
        <div className="mb-4 p-4 rounded-card bg-surface border border-line space-y-3">
          <div className="relative">
            <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input className={`${INPUT} pl-9`} placeholder="Search payee or category" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select className={INPUT} value={category} onChange={e => setCategory(e.target.value)}>
                <option value="All">All categories</option>
                {[...new Set([...CATEGORIES, ...editOptions])].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Type">
              <select className={INPUT} value={type} onChange={e => setType(e.target.value)}>
                <option value="All">Money in and out</option>
                <option value="Income">Money in</option>
                <option value="Expense">Money out</option>
              </select>
            </Field>
            <Field label="From"><input type="date" className={INPUT} value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></Field>
            <Field label="To"><input type="date" className={INPUT} value={dateTo} onChange={e => setDateTo(e.target.value)} /></Field>
            <Field label="Min ₹"><input type="number" inputMode="numeric" className={INPUT} placeholder="0" value={minAmt} onChange={e => setMinAmt(e.target.value)} /></Field>
            <Field label="Max ₹"><input type="number" inputMode="numeric" className={INPUT} placeholder="Any" value={maxAmt} onChange={e => setMaxAmt(e.target.value)} /></Field>
          </div>
          {activeFilters > 0 && <Button variant="ghost" size="sm" icon={X} onClick={reset} className="-ml-2">Clear filters</Button>}
        </div>
      )}

      {grouped.length === 0 && (
        <div className="rounded-card bg-surface border border-line px-6 py-10 text-center text-small text-ink-3">
          {transactions.length ? "No transactions match your filters." : "No transactions yet."}
        </div>
      )}

      <div className="space-y-6">
        {grouped.map(([monthKey, monthLabel, monthNet, dayGroups]) => (
          <div key={monthKey}>
            <div className="flex items-baseline justify-between px-1 mb-2">
              <h3 className="text-heading text-ink">{monthLabel}</h3>
              <span className={`text-small font-semibold num ${monthNet >= 0 ? "text-good" : "text-ink-2"}`}>
                {monthNet >= 0 ? "+" : "−"}{money(monthNet)}
              </span>
            </div>
            <div className="rounded-card bg-surface border border-line overflow-hidden">
              {dayGroups.map(([key, display, txns], gi) => (
                <div key={key} className={gi ? "border-t border-line" : ""}>
                  <p className="px-4 pt-3 pb-1 text-caption font-medium text-ink-3">{formatDate(key, display)}</p>
                  <ul>
                    {txns.map(t => {
                      const pos = t.amount > 0;
                      const name = cleanMerchant(t.merchant);
                      return (
                        <li key={t.id} className="px-4 py-2">
                          <div className="flex items-center gap-3">
                            <span aria-hidden className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-small font-semibold ${pos ? "bg-good-soft text-good" : "bg-surface-sunken text-ink-2"}`}>
                              {(name.replace(/[^A-Za-z0-9]/g, "")[0] || "•").toUpperCase()}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-body text-ink truncate" title={t.merchant}>{name}</p>
                              <button type="button" onClick={() => (editingId === t.id ? cancelEdit() : startEdit(t))}
                                      className="inline-flex items-center gap-1 text-small text-ink-3 hover:text-accent max-w-full"
                                      aria-label={`Category: ${t.category}. Change`}>
                                <span className="truncate">{t.category || "Other"}</span>
                              </button>
                              <SpendGuardTxTag t={t} onChanged={onReload} />
                            </div>
                            <span className={`shrink-0 text-body font-semibold num ${pos ? "text-good" : "text-ink"}`}>
                              {pos ? "+" : "−"}{money(t.amount, 2)}
                            </span>
                          </div>
                          {editingId === t.id && renderCategoryEditor(t)}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {filtered.length > shown && (
        <div className="mt-4 text-center">
          <Button variant="secondary" onClick={() => setShown(n => n + chunkSize)}>
            Show more ({filtered.length - shown} older)
          </Button>
        </div>
      )}

      <p className="mt-4 px-1 text-caption text-ink-3">
        <span>Showing {Math.min(shown, filtered.length)} of {filtered.length}</span>
        {filtered.length !== transactions.length && ` (filtered from ${transactions.length})`}.
        {" "}Categories are FinTwin's best guess; change one and it remembers that payee.
      </p>
    </section>
  );
});

const INPUT = "w-full h-10 rounded-control bg-surface-sunken border border-transparent px-3 text-body text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent";

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-caption text-ink-3 mb-1">{label}</span>
      {children}
    </label>
  );
}

export default EnhancedTransactionsTable;

