import { useEffect, useState, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, SlidersHorizontal, X, BarChart3 } from "lucide-react";
import SpendingHeatmap from "../components/SpendingHeatmap";
import RecurringExpenses from "../components/RecurringExpenses";
import API from "../services/api";
import { monthsNeeded } from "./analyticsRange";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { Button, SectionHeader, cx, xAxis, yAxis, grid, tooltipCursor, ChartTooltip, shortRupees } from "../components/ui";
import { rupees } from "../utils/money";

const RECORD_TYPES = [["All", "Money in and out"], ["Income", "Money in"], ["Expense", "Money out"]];
const PERIOD_OPTIONS = ["This month", "Last month", "This year", "Last 12 months", "All time", "Custom"];


const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getPeriodLabel(period, customStart, customEnd) {
  if (period === "Custom" && customStart && customEnd) return `${customStart} – ${customEnd}`;
  return period;
}

function filterTransactions(transactions, filters, period, customStart, customEnd) {
  const now = new Date();
  let startDate, endDate;
  if (period === "This month") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (period === "Last month") {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    endDate   = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (period === "This year") {
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate   = new Date(now.getFullYear(), 11, 31);
  } else if (period === "Last 12 months") {
    startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  } else if (period === "All time") {
    startDate = null;                       // everything the user has imported
  } else if (period === "Custom" && customStart && customEnd) {
    startDate = new Date(customStart);
    endDate   = new Date(customEnd);
  }

  return transactions.filter(t => {
    const d = new Date(t.date);
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    if (filters.search && !t.merchant?.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.category && filters.category !== "All" && t.category !== filters.category) return false;
    if (filters.includeTransfers === false && t.category === "Transfer") return false;
    if (filters.recordType === "Income" && t.amount <= 0) return false;
    if (filters.recordType === "Expense" && t.amount >= 0) return false;
    if (filters.minAmount && Math.abs(t.amount) < parseFloat(filters.minAmount)) return false;
    if (filters.maxAmount && Math.abs(t.amount) > parseFloat(filters.maxAmount)) return false;
    return true;
  });
}

function prevPeriodTransactions(transactions, period) {
  const now = new Date();
  let startDate, endDate;
  if (period === "This month") {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    endDate   = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (period === "Last month") {
    startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    endDate   = new Date(now.getFullYear(), now.getMonth() - 1, 0);
  } else {
    return [];
  }
  return transactions.filter(t => {
    const d = new Date(t.date);
    return d >= startDate && d <= endDate;
  });
}

// ─── Filter panel ─────────────────────────────────────────────────────────────
const EMPTY_FILTERS = { search: "", category: "All", recordType: "All", minAmount: "", maxAmount: "", includeTransfers: true };
const INPUT = "w-full h-10 rounded-control bg-surface-sunken border border-transparent px-3 text-body text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent";

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-caption text-ink-3 mb-1">{label}</span>
      {children}
    </label>
  );
}

function FilterPanel({ filters, setFilters, open, categories }) {
  if (!open) return null;
  const set = (k) => (e) => setFilters(f => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  return (
    <div className="mb-4 p-4 rounded-card bg-surface border border-line space-y-3">
      <input className={INPUT} placeholder="Search payee" aria-label="Search" value={filters.search} onChange={set("search")} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <select className={INPUT} value={filters.category} onChange={set("category")}>
            <option value="All">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select className={INPUT} value={filters.recordType} onChange={set("recordType")}>
            {RECORD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Min ₹"><input type="number" inputMode="numeric" className={INPUT} placeholder="0" value={filters.minAmount} onChange={set("minAmount")} /></Field>
        <Field label="Max ₹"><input type="number" inputMode="numeric" className={INPUT} placeholder="Any" value={filters.maxAmount} onChange={set("maxAmount")} /></Field>
      </div>
      <label className="flex items-center gap-2 text-small text-ink-2">
        <input type="checkbox" className="w-4 h-4 accent-[var(--accent)]" checked={filters.includeTransfers} onChange={set("includeTransfers")} />
        Include transfers between your own accounts
      </label>
      <Button variant="ghost" size="sm" icon={X} className="-ml-2" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</Button>
    </div>
  );
}

function ReportRow({ label, cur, prev, cls, strong, bar, max }) {
  return (
    <li className="px-4 py-3">
      <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4">
        <span className={cx("min-w-0 truncate text-body", strong ? "font-semibold text-ink" : "text-ink")}>{label}</span>
        <span className={cx("text-body font-semibold num text-right w-24", cls || "text-ink")}>{rupees(cur)}</span>
        <span className="text-small text-ink-3 num text-right w-20">{rupees(prev)}</span>
      </div>
      {bar != null && (
        <div className="mt-1.5 mr-[11rem] h-1 rounded-full bg-surface-sunken overflow-hidden" aria-hidden>
          <div className="h-full rounded-full bg-accent" style={{ width: `${(bar / max) * 100}%` }} />
        </div>
      )}
    </li>
    );
}

// ─── Incomes & expenses report ────────────────────────────────────────────────
// Categories come from the transactions themselves, so every category the
// app uses shows up (an old fixed list here silently dropped Food, Travel…).
function IncomesExpensesTab({ current, previous, periodLabel, prevLabel }) {
  const expenseBy = (txns) => {
    const map = {};
    txns.forEach(t => {
      if (t.amount < 0) { const cat = t.category || "Other"; map[cat] = (map[cat] || 0) + Math.abs(t.amount); }
    });
    return map;
  };
  const curMap = expenseBy(current);
  const prevMap = expenseBy(previous);
  const cats = [...new Set([...Object.keys(curMap), ...Object.keys(prevMap)])]
    .sort((a, b) => (curMap[b] || 0) - (curMap[a] || 0) || (prevMap[b] || 0) - (prevMap[a] || 0));

  const inc = (txns) => txns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const exp = (txns) => txns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const incCur = inc(current), expCur = exp(current), incPrev = inc(previous), expPrev = exp(previous);
  const max = Math.max(1, ...Object.values(curMap));

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-4 pb-2 text-caption text-ink-3">
        <span />
        <span className="w-24 text-right font-medium text-ink-2">{periodLabel}</span>
        <span className="w-20 text-right">{prevLabel}</span>
      </div>
      <ul className="rounded-card bg-surface border border-line divide-y divide-line">
        <ReportRow max={max} label="Money in" cur={incCur} prev={incPrev} cls="text-good" />
        <ReportRow max={max} label="Money out" cur={expCur} prev={expPrev} strong />
        {cats.map(c => <ReportRow max={max} key={c} label={c} cur={curMap[c] || 0} prev={prevMap[c] || 0} bar={curMap[c] || 0} />)}
        <ReportRow max={max} label="Net" cur={incCur - expCur} prev={incPrev - expPrev} strong cls={incCur - expCur < 0 ? "text-bad" : "text-good"} />
      </ul>
    </div>
  );
}

// ─── Balance Trend Tab ────────────────────────────────────────────────────────
function BalanceTrendTab({ transactions }) {
  const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
  const chartData = sorted.reduce((acc, t) => {
    const prev = acc.length ? acc[acc.length - 1].exact : 0;
    acc.push({ date: t.date?.slice(0, 10), exact: prev + t.amount, balance: Math.round(prev + t.amount) });
    return acc;
  }, []);

  if (chartData.length === 0) {
    return <EmptyState msg="No transactions in this period to build a balance trend." />;
  }

  return (
    <div>
      <p className="text-small text-ink-3 mb-3">Money in minus money out, added up over the period</p>
      <div className="rounded-card bg-surface border border-line p-4">
        <ResponsiveContainer initialDimension={{ width: 320, height: 220 }} width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid {...grid} />
            <XAxis {...xAxis} dataKey="date" tickFormatter={shortDate} minTickGap={24} />
            <YAxis {...yAxis} />
            <Tooltip content={<ChartTooltip />} />
            <Line type="monotone" dataKey="balance" name="Balance" stroke="var(--accent)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Cash Flow Tab ────────────────────────────────────────────────────────────
function CashFlowTab({ transactions }) {
  const monthMap = {};
  transactions.forEach(t => {
    const key = t.date?.slice(0, 7);
    if (!key) return;
    if (!monthMap[key]) monthMap[key] = { month: key, income: 0, expenses: 0 };
    if (t.amount > 0) monthMap[key].income += t.amount;
    else monthMap[key].expenses += Math.abs(t.amount);
  });
  const data = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)).map(d => ({
    ...d,
    month: (() => { const [y, m] = d.month.split("-"); return `${MONTHS[parseInt(m)-1]} ${y.slice(2)}`; })(),
    income: Math.round(d.income),
    expenses: Math.round(d.expenses),
  }));

  if (data.length === 0) {
    return <EmptyState msg="No transactions in this period to show cash flow." />;
  }

  return (
    <div>
      <p className="text-small text-ink-3 mb-3">Money in and out each month</p>
      <div className="rounded-card bg-surface border border-line p-4">
        <ResponsiveContainer initialDimension={{ width: 320, height: 220 }} width="100%" height={240}>
          <BarChart data={data} barGap={3} barCategoryGap="24%" margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid {...grid} />
            <XAxis {...xAxis} dataKey="month" />
            {/* sqrt scale: one huge month doesn't flatten every other bar to a sliver */}
            <YAxis {...yAxis} scale="sqrt" domain={[0, "dataMax"]} tickFormatter={shortRupees} />
            <Tooltip cursor={tooltipCursor} content={<ChartTooltip />} />
            <Bar dataKey="income" name="Money in" fill="var(--good)" radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="expenses" name="Money out" fill="var(--border-card-hover)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-4 text-caption text-ink-3 mt-2">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-good" /> Money in</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--border-card-hover)" }} /> Money out</span>
        </div>
      </div>
    </div>
  );
}

const shortDate = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

function EmptyState({ msg }) {
  return (
    <div className="rounded-card bg-surface border border-line px-6 py-12 text-center text-small text-ink-3">
      <BarChart3 size={28} aria-hidden className="mx-auto mb-2 opacity-40" />
      {msg}
    </div>
  );
}

// ─── Main AnalyticsPage ───────────────────────────────────────────────────────
const TABS = [["report", "In and out"], ["balance", "Balance"], ["cashflow", "Cash flow"]];

export default function AnalyticsPage({ transactions = [], recurringExpenses = [], onCategoryChanged }) {
  const [activeTab, setActiveTab] = useState("report");
  const [filterOpen, setFilterOpen] = useState(false);
  const [period, setPeriod] = useState("This month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [periodDropOpen, setPeriodDropOpen] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const now = new Date();

  // The page loads the history its period needs, and keeps it: switching from
  // "All time" back to "This month" doesn't fetch again.
  const [rows, setRows] = useState(transactions);
  const [loadedMonths, setLoadedMonths] = useState(null);   // null = only what the dashboard passed
  const need = monthsNeeded(period, customStart);
  // Derived, not state: it is true exactly while what's loaded is short of
  // what the period needs
  const loadingRange = loadedMonths !== 0 && (loadedMonths === null || need === 0 || need > loadedMonths);

  const loadRange = useCallback((months) => {
    API.get("/transactions", { params: { months } })
      .then(r => {
        setRows(Array.isArray(r.data) ? r.data : []);
        setLoadedMonths(months);
      })
      .catch(() => setLoadedMonths(months));   // keep the dashboard's months on screen
  }, []);

  useEffect(() => {
    if (loadingRange) loadRange(need);
  }, [need, loadingRange, loadRange]);

  // Until the first fetch lands, show what the dashboard already had
  const source = loadedMonths === null ? transactions : rows;

  const currentTxns = useMemo(() => filterTransactions(source, filters, period, customStart, customEnd), [source, filters, period, customStart, customEnd]);
  const previousTxns = useMemo(() => prevPeriodTransactions(source, period), [source, period]);

  const periodLabel = (() => {
    if (period === "This month") return `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
    if (period === "Last month") { const d = new Date(now.getFullYear(), now.getMonth()-1, 1); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
    if (period === "This year") return `${now.getFullYear()}`;
    return getPeriodLabel(period, customStart, customEnd);
  })();
  const prevLabel = (() => {
    if (period === "This month") { const d = new Date(now.getFullYear(), now.getMonth()-1, 1); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
    if (period === "Last month") { const d = new Date(now.getFullYear(), now.getMonth()-2, 1); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
    return "Previous";
  })();

  const navigatePeriod = (dir) => {
    const idx = PERIOD_OPTIONS.indexOf(period);
    if (dir < 0 && idx > 0) setPeriod(PERIOD_OPTIONS[idx - 1]);
    if (dir > 0 && idx < PERIOD_OPTIONS.length - 1) setPeriod(PERIOD_OPTIONS[idx + 1]);
  };

  const categories = useMemo(() => [...new Set(source.map(t => t.category).filter(Boolean))].sort(), [source]);
  const activeFilters = Object.keys(EMPTY_FILTERS).filter(k => filters[k] !== EMPTY_FILTERS[k]).length;

  return (
    <section aria-label="Reports" className="max-w-2xl">
      <SectionHeader
        title="Analytics"
        subtitle={loadingRange ? "Loading…" : `${currentTxns.length} transactions`}
        action={
          <Button variant={activeFilters ? "soft" : "secondary"} size="sm" icon={SlidersHorizontal} onClick={() => setFilterOpen(o => !o)} aria-expanded={filterOpen}>
            Filter{activeFilters ? ` (${activeFilters})` : ""}
          </Button>
        }
      />

      <FilterPanel filters={filters} setFilters={setFilters} open={filterOpen} categories={categories} />

      {/* Period: step through, or pick one */}
      <div className="flex items-center gap-2 mb-3">
        <button type="button" onClick={() => navigatePeriod(-1)} aria-label="Previous period" className={NAV_BTN}><ChevronLeft size={18} aria-hidden /></button>
        <div className="relative flex-1">
          <button type="button" onClick={() => setPeriodDropOpen(o => !o)} aria-expanded={periodDropOpen}
                  className="w-full h-10 rounded-full bg-surface border border-line flex items-center justify-center gap-1.5 text-body font-medium text-ink">
            {period}
            <ChevronDown size={16} aria-hidden className="text-ink-3" />
          </button>
          {periodDropOpen && (
            <div className="absolute top-[calc(100%+6px)] inset-x-0 z-50 p-1.5 rounded-[14px] bg-surface border border-line shadow-[0_12px_32px_rgba(17,17,26,0.12)]">
              {PERIOD_OPTIONS.map(p => (
                <button key={p} type="button" onClick={() => { setPeriod(p); setPeriodDropOpen(false); }}
                        className={cx("block w-full text-left px-3 py-2.5 rounded-[10px] text-body", period === p ? "text-accent font-semibold" : "text-ink hover:bg-surface-sunken")}>
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={() => navigatePeriod(1)} aria-label="Next period" className={NAV_BTN}><ChevronRight size={18} aria-hidden /></button>
      </div>
      {period === "Custom" && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <input type="date" aria-label="From" value={customStart} onChange={e => setCustomStart(e.target.value)} className={INPUT} />
          <input type="date" aria-label="To" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className={INPUT} />
        </div>
      )}

      <div role="tablist" aria-label="Report" className="grid grid-cols-3 p-1 mb-4 rounded-full bg-surface-sunken">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={activeTab === key} onClick={() => setActiveTab(key)}
                  className={cx("h-9 rounded-full text-small font-medium transition-colors",
                    activeTab === key ? "bg-surface text-ink shadow-[0_1px_2px_rgba(17,17,26,0.08)]" : "text-ink-3")}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === "report" && (
        <IncomesExpensesTab current={currentTxns} previous={previousTxns} periodLabel={periodLabel} prevLabel={prevLabel} />
      )}
      {activeTab === "balance" && <BalanceTrendTab transactions={currentTxns} />}
      {activeTab === "cashflow" && <CashFlowTab transactions={source} />}

      <div className="mt-8">
        <SpendingHeatmap onCategoryChanged={onCategoryChanged} />
      </div>
      <div className="mt-8">
        <RecurringExpenses recurringExpenses={recurringExpenses} />
      </div>
    </section>
  );
}

const NAV_BTN = "shrink-0 w-10 h-10 rounded-full bg-surface border border-line flex items-center justify-center text-ink-2";
