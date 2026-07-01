import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, SlidersHorizontal, X, RotateCcw, BarChart3 } from "lucide-react";
import SpendingHeatmap from "../components/SpendingHeatmap";
import RecurringExpenses from "../components/RecurringExpenses";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// ─── Categories (Wallet-style) ───────────────────────────────────────────────
const CATEGORIES = [
  { name: "Food & Drinks",       icon: "🍔", color: "#f87171" },
  { name: "Shopping",            icon: "🛒", color: "#a78bfa" },
  { name: "Housing",             icon: "🏠", color: "#22d3ee" },
  { name: "Transportation",      icon: "🚌", color: "#fbbf24" },
  { name: "Vehicle",             icon: "🚗", color: "#fb923c" },
  { name: "Life & Entertainment",icon: "🎭", color: "#f472b6" },
  { name: "Communication/PC",    icon: "💻", color: "#38bdf8" },
  { name: "Financial Expenses",  icon: "💰", color: "#4ade80" },
  { name: "Investments",         icon: "📈", color: "#a3e635" },
  { name: "Others",              icon: "📦", color: "#94a3b8" },
  { name: "Unknown",             icon: "❓", color: "#6b7280" },
];

const RECORD_TYPES = ["All", "Income", "Expense", "Transfer"];
const RECORD_STATES = ["All", "Cleared", "Pending"];
const PERIOD_OPTIONS = ["This month", "Last month", "This year", "Custom"];

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

// ─── Filter Sidebar ───────────────────────────────────────────────────────────
function FilterSidebar({ filters, setFilters, open, onClose }) {
  const reset = () => setFilters({
    search: "", category: "All", recordType: "All", recordState: "All",
    minAmount: "", maxAmount: "", includeTransfers: true,
  });

  return (
    <div style={{
      position: "relative", width: open ? 240 : 0, flexShrink: 0,
      overflow: "hidden", transition: "width 0.25s ease",
    }}>
      <div style={{
        width: 240, height: "100%",
        background: "rgba(255,255,255,0.018)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        padding: open ? "20px 16px" : 0, overflowY: "auto",
        fontFamily: "'DM Sans', system-ui, sans-serif",
        minHeight: 600,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-label)", letterSpacing: "0.1em" }}>MY FILTER</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 2 }}>
            <X size={14} />
          </button>
        </div>

        {/* Search */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Search</label>
          <input
            style={inputStyle}
            placeholder="Search transactions..."
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          />
        </div>

        {/* Category */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Categories</label>
          <select
            style={selectStyle}
            value={filters.category}
            onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}
          >
            <option value="All">All categories</option>
            {CATEGORIES.map(c => <option key={c.name} value={c.name}>{c.icon} {c.name}</option>)}
          </select>
        </div>

        {/* Record type */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Record types</label>
          <select
            style={selectStyle}
            value={filters.recordType}
            onChange={e => setFilters(f => ({ ...f, recordType: e.target.value }))}
          >
            {RECORD_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* Amount range */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Amount range</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="number" placeholder="Min" style={{ ...inputStyle, flex: 1, fontSize: 11 }}
              value={filters.minAmount}
              onChange={e => setFilters(f => ({ ...f, minAmount: e.target.value }))}
            />
            <input
              type="number" placeholder="Max" style={{ ...inputStyle, flex: 1, fontSize: 11 }}
              value={filters.maxAmount}
              onChange={e => setFilters(f => ({ ...f, maxAmount: e.target.value }))}
            />
          </div>
        </div>

        {/* Transfers toggle */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Transfers</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={filters.includeTransfers}
              onChange={e => setFilters(f => ({ ...f, includeTransfers: e.target.checked }))}
              style={{ accentColor: "#a78bfa" }}
            />
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Include transfers</span>
          </label>
        </div>

        {/* Record state */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Record States</label>
          <select
            style={selectStyle}
            value={filters.recordState}
            onChange={e => setFilters(f => ({ ...f, recordState: e.target.value }))}
          >
            {RECORD_STATES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* Reset */}
        <button
          onClick={reset}
          style={{
            width: "100%", padding: "9px 0", borderRadius: 10,
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
            color: "var(--text-secondary)", fontSize: 12, fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            fontFamily: "inherit",
          }}
        >
          <RotateCcw size={12} /> Reset Filter
        </button>
      </div>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 10, fontWeight: 700, color: "var(--text-label)", letterSpacing: "0.08em", marginBottom: 6 };
const inputStyle = {
  width: "100%", padding: "7px 10px", borderRadius: 8,
  background: "var(--bg-input)", border: "1px solid var(--border-subtle)",
  color: "var(--text-primary)", fontSize: 12, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};
const selectStyle = {
  ...inputStyle, appearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2394a3b8'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center",
};

// ─── Incomes & Expenses Report Tab ───────────────────────────────────────────
function IncomesExpensesTab({ current, previous, periodLabel, prevLabel }) {
  const catSummary = (txns) => {
    const map = {};
    txns.forEach(t => {
      const cat = t.category || "Unknown";
      if (!map[cat]) map[cat] = { income: 0, expense: 0 };
      if (t.amount > 0) map[cat].income += t.amount;
      else map[cat].expense += Math.abs(t.amount);
    });
    return map;
  };

  const curMap  = catSummary(current);
  const prevMap = catSummary(previous);
  const totalIncCur  = current.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
  const totalExpCur  = current.filter(t=>t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0);
  const totalIncPrev = previous.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
  const totalExpPrev = previous.filter(t=>t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0);

  const fmt = n => `₹${n.toLocaleString("en-IN",{maximumFractionDigits:0})}`;

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'DM Sans', system-ui" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.08em" }}>Category</th>
              <th style={{ textAlign: "right", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#a78bfa" }}>{periodLabel}</th>
              <th style={{ textAlign: "right", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "var(--text-dim)" }}>{prevLabel}</th>
            </tr>
          </thead>
          <tbody>
            {/* Income section */}
            <tr style={{ background: "rgba(74,222,128,0.04)" }}>
              <td colSpan={3} style={{ padding: "8px 16px", fontSize: 11, fontWeight: 700, color: "#4ade80", letterSpacing: "0.08em" }}>TOTAL INCOME</td>
            </tr>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <td style={{ padding: "10px 16px 10px 32px", fontSize: 13, color: "rgba(148,163,184,0.7)", display: "flex", alignItems: "center", gap: 8 }}>
                <span>💵</span> Income
              </td>
              <td style={{ textAlign: "right", padding: "10px 16px", fontSize: 13, fontWeight: 600, color: "#4ade80" }}>{fmt(totalIncCur)}</td>
              <td style={{ textAlign: "right", padding: "10px 16px", fontSize: 13, color: "var(--text-dim)" }}>{fmt(totalIncPrev)}</td>
            </tr>

            {/* Expense section */}
            <tr style={{ background: "rgba(248,113,113,0.04)" }}>
              <td colSpan={3} style={{ padding: "8px 16px", fontSize: 11, fontWeight: 700, color: "#f87171", letterSpacing: "0.08em" }}>TOTAL EXPENSE</td>
            </tr>
            {CATEGORIES.map(cat => {
              const curAmt  = (curMap[cat.name]?.expense)  || 0;
              const prevAmt = (prevMap[cat.name]?.expense) || 0;
              if (curAmt === 0 && prevAmt === 0) return null;
              return (
                <tr key={cat.name} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                  <td style={{ padding: "9px 16px 9px 32px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14 }}>{cat.icon}</span>
                      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>{cat.name}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: "right", padding: "9px 16px", fontSize: 13, fontWeight: 600, color: "#f87171" }}>{curAmt ? fmt(curAmt) : <span style={{color:"var(--text-dimmer)"}}>₹0</span>}</td>
                  <td style={{ textAlign: "right", padding: "9px 16px", fontSize: 13, color: "var(--text-dim)" }}>{prevAmt ? fmt(prevAmt) : <span style={{color:"var(--text-dimmer)"}}>₹0</span>}</td>
                </tr>
              );
            })}
            {/* Totals row */}
            <tr style={{ borderTop: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)" }}>
              <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "#fff" }}>Net (Income – Expense)</td>
              <td style={{ textAlign: "right", padding: "12px 16px", fontSize: 13, fontWeight: 700, color: totalIncCur - totalExpCur >= 0 ? "#4ade80" : "#f87171" }}>
                {fmt(totalIncCur - totalExpCur)}
              </td>
              <td style={{ textAlign: "right", padding: "12px 16px", fontSize: 13, fontWeight: 700, color: totalIncPrev - totalExpPrev >= 0 ? "#4ade80" : "#f87171" }}>
                {fmt(totalIncPrev - totalExpPrev)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Balance Trend Tab ────────────────────────────────────────────────────────
function BalanceTrendTab({ transactions }) {
  const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
  let running = 0;
  const chartData = sorted.map(t => {
    running += t.amount;
    return { date: t.date?.slice(0, 10), balance: Math.round(running) };
  });

  if (chartData.length === 0) {
    return <EmptyState msg="No transactions in this period to build a balance trend." />;
  }

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em", marginBottom: 12 }}>RUNNING BALANCE OVER TIME</div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(148,163,184,0.5)" }} />
          <YAxis tick={{ fontSize: 10, fill: "rgba(148,163,184,0.5)" }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
          <Tooltip
            contentStyle={{ background: "#0e1018", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12 }}
            formatter={v => [`₹${v.toLocaleString("en-IN")}`, "Balance"]}
          />
          <Line type="monotone" dataKey="balance" stroke="#a78bfa" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
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
      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em", marginBottom: 12 }}>MONTHLY CASH FLOW</div>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: "rgba(148,163,184,0.5)" }} />
          <YAxis tick={{ fontSize: 10, fill: "rgba(148,163,184,0.5)" }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{ background: "#0e1018", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12 }}
            formatter={(v, n) => [`₹${v.toLocaleString("en-IN")}`, n === "income" ? "Income" : "Expenses"]}
          />
          <Legend formatter={v => v === "income" ? "Money In" : "Money Out"} />
          <Bar dataKey="income"   fill="#4ade80" radius={[4,4,0,0]} fillOpacity={0.85} />
          <Bar dataKey="expenses" fill="#f87171" radius={[4,4,0,0]} fillOpacity={0.85} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function EmptyState({ msg }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-dim)", fontSize: 13 }}>
      <BarChart3 size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
      <div>{msg}</div>
    </div>
  );
}

// ─── Main AnalyticsPage ───────────────────────────────────────────────────────
const TABS = ["Incomes & Expenses Report", "Balance Trend", "Cash Flow"];

export default function AnalyticsPage({ transactions = [], recurringExpenses = [] }) {
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [filterOpen, setFilterOpen] = useState(typeof window !== "undefined" && window.innerWidth > 768);
  const [period, setPeriod] = useState("This month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [periodDropOpen, setPeriodDropOpen] = useState(false);
  const [filters, setFilters] = useState({
    search: "", category: "All", recordType: "All", recordState: "All",
    minAmount: "", maxAmount: "", includeTransfers: true,
  });

  const now = new Date();

  const currentTxns = useMemo(() => filterTransactions(transactions, filters, period, customStart, customEnd), [transactions, filters, period, customStart, customEnd]);
  const previousTxns = useMemo(() => prevPeriodTransactions(transactions, period), [transactions, period]);

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

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", minHeight: "100vh" }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <BarChart3 size={18} color="#a78bfa" />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.12em" }}>OVERVIEW</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: 0 }}>Analytics</h2>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={() => setFilterOpen(o => !o)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 10, cursor: "pointer",
              background: filterOpen ? "rgba(167,139,250,0.12)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${filterOpen ? "rgba(167,139,250,0.3)" : "rgba(255,255,255,0.08)"}`,
              color: filterOpen ? "#a78bfa" : "rgba(148,163,184,0.6)",
              fontSize: 12, fontWeight: 600, fontFamily: "inherit",
            }}
          >
            <SlidersHorizontal size={13} /> Filters
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 0, minHeight: 600 }}>
        {/* Filter Sidebar */}
        <FilterSidebar filters={filters} setFilters={setFilters} open={filterOpen} onClose={() => setFilterOpen(false)} />

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 0 }}>
          {/* Month navigation */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 16px", marginBottom: 16,
            background: "rgba(255,255,255,0.018)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 14,
          }}>
            <button onClick={() => navigatePeriod(-1)} style={navBtnStyle}><ChevronLeft size={16} /></button>
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setPeriodDropOpen(o => !o)}
                style={{ ...navBtnStyle, padding: "6px 16px", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--text-primary)", minWidth: 140 }}
              >
                {period}
                <ChevronRight size={12} style={{ transform: "rotate(90deg)" }} />
              </button>
              {periodDropOpen && (
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50,
                  background: "var(--bg-floating)", border: "1px solid var(--border-floating)",
                  borderRadius: 12, overflow: "hidden", minWidth: 160,
                  boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
                }}>
                  {PERIOD_OPTIONS.map(p => (
                    <button key={p} onClick={() => { setPeriod(p); setPeriodDropOpen(false); }} style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "10px 16px", background: period === p ? "rgba(167,139,250,0.1)" : "none",
                      border: "none", color: period === p ? "#a78bfa" : "var(--text-secondary)",
                      fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                    }}>
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => navigatePeriod(1)} style={navBtnStyle}><ChevronRight size={16} /></button>
            {period === "Custom" && (
              <div style={{ display: "flex", gap: 6, marginLeft: 8 }}>
                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ ...inputStyle, width: 140, fontSize: 12 }} />
                <span style={{ color: "var(--text-muted)", alignSelf: "center" }}>–</span>
                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ ...inputStyle, width: 140, fontSize: 12 }} />
              </div>
            )}
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>
              {currentTxns.length} transactions
            </span>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 2, marginBottom: 0, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderBottom: "none", borderRadius: "14px 14px 0 0", padding: "8px 8px 0", overflow: "hidden" }}>
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "9px 16px", borderRadius: "10px 10px 0 0",
                  border: "none", cursor: "pointer", fontFamily: "inherit",
                  fontSize: 12, fontWeight: 600, transition: "all 0.15s",
                  background: activeTab === tab ? "rgba(167,139,250,0.12)" : "transparent",
                  color: activeTab === tab ? "#a78bfa" : "rgba(148,163,184,0.5)",
                  borderBottom: activeTab === tab ? "2px solid #a78bfa" : "2px solid transparent",
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderTop: "none",
            borderRadius: "0 0 14px 14px",
            padding: 20,
          }}>
            {activeTab === "Incomes & Expenses Report" && (
              <IncomesExpensesTab
                current={currentTxns}
                previous={previousTxns}
                periodLabel={periodLabel}
                prevLabel={prevLabel}
              />
            )}
            {activeTab === "Balance Trend"  && <BalanceTrendTab transactions={currentTxns} />}
            {activeTab === "Cash Flow"      && <CashFlowTab transactions={transactions} />}
          </div>

          {/* Spending Heatmap */}
          <div style={{ marginTop: 24 }}>
            <SpendingHeatmap transactions={currentTxns} />
          </div>

          {/* Recurring Expenses */}
          <div style={{ marginTop: 24 }}>
            <RecurringExpenses recurringExpenses={recurringExpenses} />
          </div>
        </div>
      </div>
    </div>
  );
}

const navBtnStyle = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
  padding: "6px 10px", borderRadius: 8,
  background: "var(--bg-input)", border: "1px solid var(--border-subtle)",
  color: "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit",
};
