import { useEffect, useState } from "react";
import API from "../services/api";

const gotoSection = (name) => {
  localStorage.setItem("activeSection", name);
  window.dispatchEvent(new Event("dashboardNav"));
};

// Module-level cache — survives remounts within the same browser session.
// Cleared on hard refresh. Lets the tab render instantly on repeat visits
// while a background refresh runs silently.
let _portfolioCache = null;
let _nwCache = null;
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer
} from "recharts";
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, RefreshCw, Landmark, Wallet, ArrowRight } from "lucide-react";

const INVESTMENT_TYPES = [
    "Stocks", "Mutual Fund", "Fixed Deposit", "Gold", "PPF", "NPS", "Bonds", "Crypto", "Real Estate", "Other"
];

const TYPE_COLORS = {
    "Stocks":       "#a78bfa",
    "Mutual Fund":  "#22d3ee",
    "Fixed Deposit":"#4ade80",
    "Gold":         "#fbbf24",
    "PPF":          "#f87171",
    "NPS":          "#f472b6",
    "Bonds":        "#38bdf8",
    "Crypto":       "#fb923c",
    "Real Estate":  "#a3e635",
    "Other":        "#94a3b8",
};

const EMPTY_FORM = {
    name: "", type: "Stocks", investedAmount: "", currentValue: "",
    purchaseDate: "", tickerCode: "", units: "", interestRate: "", notes: ""
};

// What extra fields each type needs
const TYPE_FIELDS = {
    "Mutual Fund":   { ticker: "AMFI Scheme Code",  units: "Units Held",   rate: false },
    "Stocks":        { ticker: "NSE Ticker (e.g. TCS)", units: "Shares",   rate: false },
    "Gold":          { ticker: false,                units: "Grams",        rate: false },
    "Crypto":        { ticker: "Symbol (e.g. BTC)",  units: "Coins",       rate: false },
    "Fixed Deposit": { ticker: false,                units: false,          rate: "Interest Rate (%)" },
    "Bonds":         { ticker: false,                units: false,          rate: "Interest Rate (%)" },
    "PPF":           { ticker: false,                units: false,          rate: false },
    "NPS":           { ticker: false,                units: false,          rate: false },
    "Real Estate":   { ticker: false,                units: false,          rate: false },
    "Other":         { ticker: false,                units: false,          rate: false },
};

function fmt(n) {
    return typeof n === "number" ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—";
}

// These types have no live market price — their current value is a compound
// interest projection, so the UI marks them rather than implying a quote.
const ESTIMATED_TYPES = new Set(["Fixed Deposit", "PPF", "NPS", "Bonds"]);

export default function PortfolioTab() {
    const [summary, setSummary] = useState(_portfolioCache);
    const [loading, setLoading] = useState(!_portfolioCache);
    const [showModal, setShowModal] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(null);
    const [detected, setDetected] = useState(null);
    const [detecting, setDetecting] = useState(false);
    const [selected, setSelected] = useState({});
    const [importing, setImporting] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [refreshNote, setRefreshNote] = useState(null);
    const [netWorth, setNetWorth] = useState(_nwCache);

    const load = async () => {
        try {
            if (!_portfolioCache) setLoading(true);
            const [portfolioRes, nwRes] = await Promise.all([
                API.get("/portfolio"),
                API.get("/net-worth").catch(() => null),
            ]);
            _portfolioCache = portfolioRes.data;
            setSummary(portfolioRes.data);
            if (nwRes) { _nwCache = nwRes.data; setNetWorth(nwRes.data); }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const openAdd = () => {
        setEditId(null);
        setForm(EMPTY_FORM);
        setShowModal(true);
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        setRefreshNote(null);
        try {
            const res = await API.post("/portfolio/refresh");
            _portfolioCache = res.data;
            setSummary(res.data);

            // pricesUpdated: null = the market-data call failed, a number =
            // how many holdings actually got a live price. Only types with a
            // ticker/units/rate can be priced, so 0 is meaningful feedback.
            const n = res.data?.pricesUpdated;
            if (n === null || n === undefined) {
                setRefreshNote({ ok: false, text: "Market data unavailable — prices unchanged." });
            } else if (n === 0) {
                setRefreshNote({ ok: false, text: "No holdings could be priced. Add a ticker code, units or interest rate." });
            } else {
                setRefreshNote({ ok: true, text: `Updated ${n} holding${n === 1 ? "" : "s"} with live prices.` });
            }
        } catch (err) {
            console.error(err);
            setRefreshNote({ ok: false, text: "Price refresh failed. Please try again." });
        } finally {
            setRefreshing(false);
        }
    };

    const openEdit = (h) => {
        setEditId(h.id);
        setForm({
            name:          h.name          || "",
            type:          h.type          || "Stocks",
            investedAmount:h.investedAmount ?? "",
            currentValue:  h.currentValue  ?? "",
            purchaseDate:  h.purchaseDate  || "",
            tickerCode:    h.tickerCode    || "",
            units:         h.units         ?? "",
            interestRate:  h.interestRate  ?? "",
            notes:         h.notes         || "",
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.name.trim() || !form.investedAmount) return;
        setSaving(true);
        try {
            const payload = {
                name:           form.name,
                type:           form.type,
                investedAmount: parseFloat(form.investedAmount),
                currentValue:   form.currentValue !== "" ? parseFloat(form.currentValue) : parseFloat(form.investedAmount),
                purchaseDate:   form.purchaseDate || null,
                tickerCode:     form.tickerCode   || null,
                units:          form.units        !== "" ? parseFloat(form.units) : null,
                interestRate:   form.interestRate !== "" ? parseFloat(form.interestRate) : null,
                notes:          form.notes        || null,
            };
            if (editId) {
                await API.put(`/portfolio/${editId}`, payload);
            } else {
                await API.post("/portfolio", payload);
            }
            setShowModal(false);
            await load();
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        setDeleting(id);
        try {
            await API.delete(`/portfolio/${id}`);
            await load();
        } catch (err) {
            console.error(err);
        } finally {
            setDeleting(null);
        }
    };

    const handleAutoDetect = async () => {
        setDetecting(true);
        try {
            const res = await API.get("/portfolio/auto-detect");
            const items = res.data;
            setDetected(items);
            // pre-select all
            const sel = {};
            items.forEach((_, i) => { sel[i] = true; });
            setSelected(sel);
        } catch (err) {
            console.error(err);
        } finally {
            setDetecting(false);
        }
    };

    const handleImport = async () => {
        const toImport = detected.filter((_, i) => selected[i]);
        if (!toImport.length) return;
        setImporting(true);
        try {
            for (const item of toImport) {
                await API.post("/portfolio", {
                    name:           item.name,
                    type:           item.type,
                    investedAmount: item.investedAmount,
                    currentValue:   item.currentValue,
                    purchaseDate:   item.purchaseDate,
                });
            }
            setDetected(null);
            setSelected({});
            await load();
        } catch (err) {
            console.error(err);
        } finally {
            setImporting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 text-zinc-500">
                Loading portfolio...
            </div>
        );
    }

    const holdings = summary?.holdings || [];
    const alloc    = summary?.allocationByType || {};
    const pieData  = Object.entries(alloc).map(([type, pct]) => ({ name: type, value: pct }));

    const pnlPositive = (summary?.totalPnl ?? 0) >= 0;

    // Net worth contribution banner values
    const nwTotal = netWorth?.netWorth || 0;
    const nwPortfolio = netWorth?.portfolioCurrentValue || 0;
    const nwPct = nwTotal > 0 ? Math.round((nwPortfolio / nwTotal) * 100) : 0;
    const nwPnl = netWorth?.portfolioPnl || 0;
    const nwPnlPositive = nwPnl >= 0;

    return (
        <div>
            {/* Net Worth contribution banner */}
            {netWorth && nwTotal > 0 && (
                <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.18)", borderRadius: 14, padding: "14px 18px", marginBottom: 18, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.22)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Wallet size={16} color="#f59e0b" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.08em", marginBottom: 3 }}>NET WORTH CONTRIBUTION</div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 16, fontWeight: 800, color: "#f59e0b", fontVariantNumeric: "tabular-nums" }}>
                                ₹{Math.round(nwPortfolio).toLocaleString("en-IN")}
                            </span>
                            <span style={{ fontSize: 12, color: "rgba(148,163,184,0.5)" }}>
                                of ₹{Math.round(nwTotal).toLocaleString("en-IN")} total net worth
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,0.12)", borderRadius: 6, padding: "2px 8px" }}>
                                {nwPct}%
                            </span>
                            {nwPnl !== 0 && (
                                <span style={{ fontSize: 12, fontWeight: 700, color: nwPnlPositive ? "#4ade80" : "#f87171" }}>
                                    {nwPnlPositive ? "▲ +" : "▼ −"}₹{Math.abs(Math.round(nwPnl)).toLocaleString("en-IN")} P&L
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={() => gotoSection("Net Worth")}
                        style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 9, padding: "7px 12px", color: "#f59e0b", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}
                    >
                        Net Worth <ArrowRight size={12} />
                    </button>
                </div>
            )}

            {/* Action buttons */}
            <div className="flex justify-end gap-2 mb-4">
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/10 border border-green-500/20 text-green-300 text-sm font-medium hover:bg-green-500/20 transition-all"
                >
                    {refreshing
                        ? <><RefreshCw size={14} className="animate-spin" /> Refreshing...</>
                        : <><RefreshCw size={14} /> Refresh Prices</>
                    }
                </button>
                <button
                    onClick={handleAutoDetect}
                    disabled={detecting}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-sm font-medium hover:bg-cyan-500/20 transition-all"
                >
                    {detecting
                        ? <><RefreshCw size={14} className="animate-spin" /> Scanning...</>
                        : <><Landmark size={14} /> Sync from Bank</>
                    }
                </button>
            </div>

            {refreshNote && (
                <div
                    className={`mb-4 px-4 py-2.5 rounded-xl text-xs border ${
                        refreshNote.ok
                            ? "bg-green-500/5 border-green-500/20 text-green-300"
                            : "bg-amber-500/5 border-amber-500/20 text-amber-300"
                    }`}
                >
                    {refreshNote.text}
                </div>
            )}

            {/* Summary cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                <SummaryCard label="Total Invested" value={`₹${fmt(summary?.totalInvested)}`} color="text-white" />
                <SummaryCard label="Current Value"  value={`₹${fmt(summary?.currentValue)}`}  color="text-blue-400" />
                <SummaryCard
                    label="Total P&L"
                    value={`${pnlPositive ? "+" : ""}₹${fmt(summary?.totalPnl)}`}
                    color={pnlPositive ? "text-green-400" : "text-red-400"}
                    icon={pnlPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                />
                <SummaryCard
                    label="P&L %"
                    value={`${pnlPositive ? "+" : ""}${summary?.totalPnlPercent ?? 0}%`}
                    color={pnlPositive ? "text-green-400" : "text-red-400"}
                />
            </div>

            {holdings.length === 0 ? (
                /* Empty state */
                <div className="relative overflow-hidden p-10 border border-white/10 bg-white/[0.03] rounded-2xl text-center mb-6">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                    <p className="text-zinc-400 mb-4 text-sm">No holdings yet. Add your first investment to start tracking.</p>
                    <button onClick={openAdd} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-violet-600 text-sm font-semibold hover:opacity-90 transition-all">
                        <Plus size={15} /> Add Investment
                    </button>
                </div>
            ) : (
                <div className="grid xl:grid-cols-[1fr_1.4fr] gap-4 mb-6">
                    {/* Pie chart */}
                    <div className="relative overflow-hidden p-6 border border-white/10 bg-white/[0.03] rounded-2xl">
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                        <div className="text-[10px] font-bold tracking-[0.1em] text-zinc-500 mb-4">ALLOCATION</div>
                        <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    dataKey="value"
                                    nameKey="name"
                                    innerRadius={50}
                                    outerRadius={90}
                                    labelLine={false}
                                    label={({ value }) => `${value}%`}
                                >
                                    {pieData.map((entry) => (
                                        <Cell key={entry.name} fill={TYPE_COLORS[entry.name] || "#94a3b8"} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(v) => `${v}%`} />
                            </PieChart>
                        </ResponsiveContainer>
                        {/* Legend */}
                        <div className="flex flex-wrap gap-2 mt-2">
                            {pieData.map((entry) => (
                                <div key={entry.name} className="flex items-center gap-1.5 text-xs text-zinc-400">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: TYPE_COLORS[entry.name] || "#94a3b8" }} />
                                    {entry.name}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Holdings table */}
                    <div className="relative overflow-hidden border border-white/10 bg-white/[0.03] rounded-2xl">
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                        <div className="flex items-center justify-between p-4 border-b border-white/5">
                            <span className="text-[10px] font-bold tracking-[0.1em] text-zinc-500">HOLDINGS</span>
                            <button onClick={openAdd} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-medium hover:bg-purple-500/20 transition-all">
                                <Plus size={12} /> Add
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-[10px] font-bold tracking-wider text-zinc-500 border-b border-white/5">
                                        <th className="text-left px-4 py-2">Name</th>
                                        <th className="text-right px-4 py-2">Invested</th>
                                        <th className="text-right px-4 py-2">Current</th>
                                        <th className="text-right px-4 py-2">P&L</th>
                                        <th className="px-4 py-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {holdings.map((h) => {
                                        const pos = (h.pnl ?? 0) >= 0;
                                        return (
                                            <tr key={h.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-white text-xs leading-tight">{h.name}</div>
                                                    <div className="text-[10px] text-zinc-500 mt-0.5" style={{ color: TYPE_COLORS[h.type] || "#94a3b8" }}>{h.type}</div>
                                                </td>
                                                <td className="px-4 py-3 text-right text-zinc-300 text-xs">₹{fmt(h.investedAmount)}</td>
                                                <td className="px-4 py-3 text-right text-xs text-blue-400">
                                                    ₹{fmt(h.currentValue)}
                                                    {ESTIMATED_TYPES.has(h.type) && (
                                                        <span
                                                            className="text-[9px] text-zinc-500 ml-1"
                                                            title="Projected from interest rate — not a live market price"
                                                        >
                                                            est.
                                                        </span>
                                                    )}
                                                </td>
                                                <td className={`px-4 py-3 text-right text-xs font-medium ${pos ? "text-green-400" : "text-red-400"}`}>
                                                    {pos ? "+" : ""}₹{fmt(h.pnl)}
                                                    <div className="text-[10px] font-normal">{pos ? "+" : ""}{h.pnlPercent}%</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1">
                                                        <button onClick={() => openEdit(h)} className="p-1 rounded text-zinc-500 hover:text-purple-400 transition-colors">
                                                            <Pencil size={12} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(h.id)}
                                                            disabled={deleting === h.id}
                                                            className="p-1 rounded text-zinc-500 hover:text-red-400 transition-colors"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Auto-detect confirm modal */}
            {detected !== null && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-2xl p-6 shadow-2xl max-h-[80vh] flex flex-col">
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent rounded-t-2xl" />

                        <div className="flex items-center justify-between mb-1">
                            <h3 className="text-base font-bold">Investments Found in Bank Transactions</h3>
                            <span className="text-xs text-zinc-500">{detected.length} detected</span>
                        </div>
                        <p className="text-xs text-zinc-500 mb-4">
                            Invested amount = total debits to each instrument. Current value defaults to the same — update it after import.
                        </p>

                        {detected.length === 0 ? (
                            <div className="text-center py-10 text-zinc-500 text-sm">
                                No investment transactions detected in your bank history.
                            </div>
                        ) : (
                            <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                                {detected.map((item, i) => (
                                    <label
                                        key={i}
                                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                                            selected[i]
                                                ? "border-cyan-500/30 bg-cyan-500/5"
                                                : "border-white/5 bg-white/[0.02]"
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            className="mt-0.5 accent-cyan-400"
                                            checked={!!selected[i]}
                                            onChange={(e) => setSelected({ ...selected, [i]: e.target.checked })}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-medium text-white truncate">{item.name}</span>
                                                <span className="text-xs font-semibold text-green-400 whitespace-nowrap">
                                                    ₹{item.investedAmount?.toLocaleString("en-IN")}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                                                    background: (TYPE_COLORS[item.type] || "#94a3b8") + "20",
                                                    color: TYPE_COLORS[item.type] || "#94a3b8"
                                                }}>{item.type}</span>
                                                {item.purchaseDate && (
                                                    <span className="text-[10px] text-zinc-500">since {item.purchaseDate}</span>
                                                )}
                                            </div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        )}

                        <div className="flex gap-3 mt-5 pt-4 border-t border-white/5">
                            <button
                                onClick={() => { setDetected(null); setSelected({}); }}
                                className="flex-1 py-2.5 rounded-xl border border-white/10 text-zinc-400 text-sm hover:bg-white/5 transition-all"
                            >
                                Cancel
                            </button>
                            {detected.length > 0 && (
                                <button
                                    onClick={handleImport}
                                    disabled={importing || !Object.values(selected).some(Boolean)}
                                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-600 text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-40"
                                >
                                    {importing ? "Importing..." : `Import ${Object.values(selected).filter(Boolean).length} Selected`}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl p-6 shadow-2xl">
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-purple-500/40 to-transparent rounded-t-2xl" />
                        <h3 className="text-base font-bold mb-5">{editId ? "Edit Investment" : "Add Investment"}</h3>

                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-zinc-400 mb-1 block">Name *</label>
                                <input
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50"
                                    placeholder="e.g. Nifty 50 Index Fund"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="text-xs text-zinc-400 mb-1 block">Type</label>
                                <select
                                    className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50"
                                    value={form.type}
                                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                                >
                                    {INVESTMENT_TYPES.map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-zinc-400 mb-1 block">Invested Amount (₹) *</label>
                                    <input
                                        type="number"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50"
                                        placeholder="50000"
                                        value={form.investedAmount}
                                        onChange={(e) => setForm({ ...form, investedAmount: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-zinc-400 mb-1 block">Current Value (₹)</label>
                                    <input
                                        type="number"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50"
                                        placeholder="Same as invested"
                                        value={form.currentValue}
                                        onChange={(e) => setForm({ ...form, currentValue: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-zinc-400 mb-1 block">Purchase Date</label>
                                <input
                                    type="date"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50"
                                    value={form.purchaseDate}
                                    onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                                />
                            </div>

                            {/* Context-sensitive live-price fields */}
                            {TYPE_FIELDS[form.type]?.ticker && (
                                <div>
                                    <label className="text-xs text-zinc-400 mb-1 block">{TYPE_FIELDS[form.type].ticker}</label>
                                    <input
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50"
                                        placeholder={form.type === "Mutual Fund" ? "e.g. 120716" : "e.g. TCS"}
                                        value={form.tickerCode}
                                        onChange={(e) => setForm({ ...form, tickerCode: e.target.value })}
                                    />
                                    <p className="text-[10px] text-zinc-600 mt-1">
                                        {form.type === "Mutual Fund" ? "Find your scheme code at mfapi.in" : "NSE ticker without .NS suffix"}
                                    </p>
                                </div>
                            )}

                            {TYPE_FIELDS[form.type]?.units && (
                                <div>
                                    <label className="text-xs text-zinc-400 mb-1 block">{TYPE_FIELDS[form.type].units}</label>
                                    <input
                                        type="number"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50"
                                        placeholder="0"
                                        value={form.units}
                                        onChange={(e) => setForm({ ...form, units: e.target.value })}
                                    />
                                </div>
                            )}

                            {TYPE_FIELDS[form.type]?.rate && (
                                <div>
                                    <label className="text-xs text-zinc-400 mb-1 block">{TYPE_FIELDS[form.type].rate}</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50"
                                        placeholder={form.type === "Fixed Deposit" ? "7.1" : "7.5"}
                                        value={form.interestRate}
                                        onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
                                    />
                                </div>
                            )}

                            {["PPF", "NPS"].includes(form.type) && (
                                <div className="px-3 py-2 rounded-xl bg-blue-500/5 border border-blue-500/15 text-[11px] text-blue-400">
                                    {form.type === "PPF" ? "PPF rate: 7.1% p.a. (auto-calculated)" : "NPS estimated return: 9% p.a. (auto-calculated)"}
                                </div>
                            )}

                            <div>
                                <label className="text-xs text-zinc-400 mb-1 block">Notes</label>
                                <input
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50"
                                    placeholder="Optional"
                                    value={form.notes}
                                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowModal(false)}
                                className="flex-1 py-2.5 rounded-xl border border-white/10 text-zinc-400 text-sm hover:bg-white/5 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || !form.name.trim() || !form.investedAmount}
                                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-violet-600 text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-40"
                            >
                                {saving ? "Saving..." : editId ? "Update" : "Add"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SummaryCard({ label, value, color, icon }) {
    return (
        <div className="relative overflow-hidden p-5 border border-white/10 bg-white/[0.03] rounded-2xl">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <p className="text-xs text-zinc-400 mb-2">{label}</p>
            <div className={`flex items-center gap-1.5 text-xl font-bold ${color}`}>
                {icon}
                {value}
            </div>
        </div>
    );
}
