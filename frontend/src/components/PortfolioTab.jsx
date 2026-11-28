import { useEffect, useState } from "react";
import API from "../services/api";
import toast from "react-hot-toast";

const gotoSection = (name) => {
  localStorage.setItem("activeSection", name);
  window.dispatchEvent(new Event("dashboardNav"));
};

// Module-level cache — survives remounts within the same browser session.
// Cleared on hard refresh. Lets the tab render instantly on repeat visits
// while a background refresh runs silently.
let _portfolioCache = null;
let _nwCache = null;
import { IPO_STATUSES } from "../constants/investments";
import LinkHoldingModal from "./LinkHoldingModal";
import InvestmentSuggestions from "./InvestmentSuggestions";
import ImportCas from "./ImportCas";
import { AllocationCard, TopInsight, TopMovers } from "./home/InvestPieces";
import useWide from "../hooks/useWide";
import { sortHoldings } from "../utils/portfolio";
import PortfolioHistoryChart from "./PortfolioHistoryChart";
import { useDebouncedSearch } from "./discover/useDebouncedSearch";
import { Plus, Pencil, Trash2, TrendingUp, RefreshCw, Landmark, Link2 } from "lucide-react";
import { Button, SectionHeader, EmptyState, IconChip, cx } from "./ui";
import HoldingPage from "./invest/HoldingPage";

import { scrollPageTop as mainScrollTop } from "../utils/scrollTop";

const INVESTMENT_TYPES = [
    "Stocks", "IPO", "Mutual Fund", "Fixed Deposit", "Gold", "PPF", "NPS", "Bonds", "Crypto", "Real Estate", "Other"
];

const TYPE_COLORS = {
    "Stocks":       "var(--accent)",
    "IPO":          "#C026D3",
    "Mutual Fund":  "#0EA5A4",
    "Fixed Deposit":"#16A34A",
    "Gold":         "#F59E0B",
    "PPF":          "#EF4444",
    "NPS":          "#EC4899",
    "Bonds":        "#3B82F6",
    "Crypto":       "#F97316",
    "Real Estate":  "#84CC16",
    "Other":        "#94A3B8",
};

const EMPTY_FORM = {
    name: "", type: "Stocks", investedAmount: "", currentValue: "",
    purchaseDate: "", tickerCode: "", units: "", interestRate: "", notes: "",
    ipoStatus: "APPLIED", ipoListingId: null,
};

// What extra fields each type needs
const TYPE_FIELDS = {
    "Mutual Fund":   { ticker: "AMFI Scheme Code",  units: "Units Held",   rate: false },
    "Stocks":        { ticker: "NSE Ticker (e.g. TCS)", units: "Shares",   rate: false },
    "IPO":           { ticker: "NSE Symbol (once listed)", units: "Shares allotted", rate: false },
    "Gold":          { ticker: false,                units: "Grams",        rate: false },
    "Crypto":        { ticker: "Symbol (e.g. BTC)",  units: "Coins",       rate: false },
    "Fixed Deposit": { ticker: false,                units: false,          rate: "Interest Rate (%)" },
    "Bonds":         { ticker: false,                units: false,          rate: "Interest Rate (%)" },
    "PPF":           { ticker: false,                units: false,          rate: false },
    "NPS":           { ticker: false,                units: false,          rate: false },
    "Real Estate":   { ticker: false,                units: false,          rate: false },
    "Other":         { ticker: false,                units: false,          rate: false },
};

/** Whole rupees, for lists where paise only crowd the row. */
function fmt0(n) {
    return typeof n === "number" ? Math.round(n).toLocaleString("en-IN") : "—";
}

function fmt(n) {
    return typeof n === "number" ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—";
}

// These types have no live market price — their current value is a compound
// interest projection, so the UI marks them rather than implying a quote.
const ESTIMATED_TYPES = new Set(["Fixed Deposit", "PPF", "NPS", "Bonds"]);

// Groww and INDmoney show holdings by kind: funds, then stocks, then the rest
const TYPE_ORDER = [
    ["Mutual Fund", "Mutual funds"], ["Stocks", "Stocks"], ["IPO", "IPOs"], ["Fixed Deposit", "Fixed deposits"],
    ["PPF", "PPF"], ["Bonds", "Bonds"], ["NPS", "NPS"], ["Gold", "Gold"], ["Crypto", "Crypto"],
];
function groupByType(list) {
    const groups = new Map();
    for (const h of list) {
        if (!groups.has(h.type)) groups.set(h.type, []);
        groups.get(h.type).push(h);
    }
    const rank = (t) => { const i = TYPE_ORDER.findIndex(([k]) => k === t); return i < 0 ? 99 : i; };
    return [...groups.entries()]
        .sort((a, b) => rank(a[0]) - rank(b[0]))
        .map(([type, items]) => ({
            type, items, label: TYPE_ORDER.find(([k]) => k === type)?.[1] || type,
            total: items.reduce((t, h) => t + (Number(h.currentValue) || 0), 0),
        }));
}

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
    const [linking, setLinking] = useState(null);          // the holding being linked
    const [splitting, setSplitting] = useState(null);
    const [sortBy, setSortBy] = useState("value");
    const [openId, setOpenId] = useState(null);       // a holding's own page
    const [health, setHealth] = useState(null);
    const wide = useWide();
    // Typing a symbol searches the market, so the user picks one that exists
    // rather than a name the exchange has never heard of ("SS RETAIL")
    const symbolSearch = useDebouncedSearch(
        form.type === "Mutual Fund" ? "/discover/funds" : "/discover/stocks");

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
    useEffect(() => {
        let live = true;
        API.get("/portfolio/health").then((r) => { if (live) setHealth(r.data); }).catch(() => {});
        return () => { live = false; };
    }, [summary?.currentValue]);

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

    // Turns a holding built from several payments into one holding per payment,
    // so each can be linked to whatever it actually went into.
    const splitHolding = async (h) => {
        setSplitting(h.id);
        try {
            const res = await API.post(`/portfolio/${h.id}/split`);
            toast.success(`Split into ${res.data.length} holdings — link each one to see its value`);
            await load();
        } catch (err) {
            toast.error(err?.response?.data?.error || "Couldn't split that holding.");
        } finally {
            setSplitting(null);
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
            ipoStatus:     h.ipoStatus     || "APPLIED",
            ipoListingId:  h.ipoListingId  ?? null,
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
                ipoStatus:      form.type === "IPO" ? form.ipoStatus : null,
                ipoListingId:   form.type === "IPO" ? form.ipoListingId : null,
            };
            const res = editId
                ? await API.put(`/portfolio/${editId}`, payload)
                : await API.post("/portfolio", payload);

            // The server prices a holding as soon as it has a symbol and units;
            // a symbol the market doesn't know used to look like a flat price
            const status = res.data?.priceStatus;
            if (status === "live") {
                toast.success(`Priced at ₹${fmt(res.data.currentValue)} — ${payload.tickerCode}`);
            } else if (status === "not_found") {
                toast.error(`No market price for "${payload.tickerCode}". Check the symbol — pick one from the suggestions as you type.`);
            } else if (status === "unavailable") {
                toast.error("Market data is unavailable right now — try Refresh in a moment.");
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
            <div className="max-w-2xl rounded-card bg-surface border border-line px-6 py-10 text-center text-small text-ink-3" role="status">
                Loading your portfolio…
            </div>
        );
    }

    const holdings = summary?.holdings || [];
    // A lump sum with nothing behind it — typically the amount entered at
    // onboarding. It can't be valued until the user says what it went into.
    const unlinked = holdings.filter(h => h.type === "Other" && !h.tickerCode);

    const pnlPositive = (summary?.totalPnl ?? 0) >= 0;

    const nwTotal = netWorth?.netWorth || 0;
    const nwPortfolio = netWorth?.portfolioCurrentValue || 0;
    const nwPct = nwTotal > 0 ? Math.round((nwPortfolio / nwTotal) * 100) : 0;
    const typeColor = (t) => TYPE_COLORS[t] || "var(--text-dim)";
    const groups = new Set(holdings.map((h) => h.type)).size;
    const setOpenHolding = (h) => { setOpenId(h.id); mainScrollTop(); };
    const opened = openId != null ? holdings.find((h) => h.id === openId) : null;

    if (opened) {
        return <HoldingPage holding={opened} onBack={() => setOpenId(null)}
                            onEdit={(h) => { setOpenId(null); openEdit(h); }}
                            onDelete={async (h) => { setOpenId(null); await handleDelete(h.id); }} />;
    }

    return (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_330px] lg:gap-7 lg:items-start">
        <div className="max-w-2xl min-w-0">
            {/* The number */}
            <section aria-label="Portfolio value" className="px-1 mb-6">
                <p className="text-small text-ink-3">Portfolio value</p>
                <p className="text-hero text-ink num mt-1">₹{fmt(Math.round(summary?.currentValue || 0))}</p>
                <p className="mt-2 text-body text-ink-2">
                    <span className={cx("font-medium num", pnlPositive ? "text-good" : "text-bad")}>
                        {pnlPositive ? "+" : "−"}₹{fmt(Math.abs(Math.round(summary?.totalPnl || 0)))} ({pnlPositive ? "+" : ""}{summary?.totalPnlPercent ?? 0}%)
                    </span>
                    {" "}on ₹{fmt(Math.round(summary?.totalInvested || 0))} put in
                </p>
                {summary?.xirr != null && (
                    <p className="mt-1 text-small text-ink-3 num">
                        {summary.xirr}% a year (XIRR), counting when each rupee went in
                    </p>
                )}
                {netWorth && nwTotal > 0 && (
                    <button type="button" onClick={() => gotoSection("Net Worth")} className="mt-1 text-small text-ink-3 hover:text-ink">
                        {nwPct}% of your net worth ›
                    </button>
                )}
            </section>

            <div className="flex flex-wrap gap-2 mb-4">
                <Button size="sm" icon={Plus} onClick={openAdd}>Add</Button>
                <Button size="sm" variant="secondary" icon={RefreshCw} onClick={handleRefresh} disabled={refreshing}>
                    {refreshing ? "Updating…" : "Update prices"}
                </Button>
                <Button size="sm" variant="secondary" icon={Landmark} onClick={handleAutoDetect} disabled={detecting}>
                    {detecting ? "Looking…" : "Find in transactions"}
                </Button>
                <ImportCas onImported={load} />
            </div>

            {refreshNote && (
                <p className={cx("mb-4 px-4 py-2.5 rounded-control text-small", refreshNote.ok ? "bg-good-soft text-good" : "bg-warn-soft text-warn")}>
                    {refreshNote.text}
                </p>
            )}

            <PortfolioHistoryChart refreshKey={summary?.currentValue} />

            {!wide && <div className="mb-6"><TopInsight health={health} navigateTo={gotoSection} /></div>}

            <InvestmentSuggestions onAdded={load} />

            {unlinked.map(h => (
                <div key={`unlinked-${h.id}`} className="mb-4 p-4 rounded-card bg-surface border border-line">
                    <div className="flex items-start gap-3">
                        <IconChip icon={Link2} tone="accent" />
                        <div className="min-w-0">
                            <p className="text-body text-ink">₹{fmt(h.investedAmount)} in “{h.name}” isn't linked yet</p>
                            <p className="text-small text-ink-3 mt-0.5">Say what you bought and when, and FinTwin shows what it's worth today.</p>
                        </div>
                    </div>
                    <div className="mt-3 ml-[52px] flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => setLinking(h)}>Link it</Button>
                        {/* Several payments to one payee can be several investments —
                            a lump sum can only ever be linked to one of them */}
                        <Button size="sm" variant="secondary" disabled={splitting === h.id} onClick={() => splitHolding(h)}>
                            {splitting === h.id ? "Splitting…" : "Split into payments"}
                        </Button>
                    </div>
                </div>
            ))}

            {holdings.length === 0 ? (
                <EmptyState icon={TrendingUp} title="No investments yet"
                            body="Add a stock, fund, FD or gold and FinTwin keeps its value up to date."
                            action={<Button icon={Plus} onClick={openAdd}>Add investment</Button>} />
            ) : (
                <>
                    {!wide && <div className="mb-6"><AllocationCard holdings={holdings} navigateTo={gotoSection} /></div>}

                    <SectionHeader title="Holdings" subtitle={`${holdings.length} ${holdings.length === 1 ? "holding" : "holdings"}`}
                        action={
                            <div role="group" aria-label="Sort holdings" className="flex gap-1">
                                {[["value", "Value"], ["returns", "Returns"], ["xirr", "XIRR"], ["name", "A–Z"]].map(([k, l]) => (
                                    <button key={k} type="button" aria-pressed={sortBy === k} onClick={() => setSortBy(k)}
                                            className={cx("h-8 px-3 rounded-full text-small font-medium transition-colors",
                                                sortBy === k ? "bg-surface-sunken text-ink" : "text-ink-3 hover:text-ink")}>
                                        {l}
                                    </button>
                                ))}
                            </div>
                        } />
                    {groupByType(sortHoldings(holdings, sortBy)).map((g) => (
                    <section key={g.type} aria-label={g.label} className="mb-5">
                    {groups > 1 && (
                        <div className="flex items-baseline justify-between px-1 mb-1.5">
                            <h3 className="text-small font-semibold text-ink-2">{g.label} <span className="font-normal text-ink-3">· {g.items.length}</span></h3>
                            <span className="text-small text-ink-3 num">₹{Math.round(g.total).toLocaleString("en-IN")}</span>
                        </div>
                    )}
                    <ul className="rounded-card bg-surface border border-line divide-y divide-line">
                        {g.items.map((h) => {
                            const pos = (h.pnl ?? 0) >= 0;
                            return (
                                <li key={h.id} className="flex items-center gap-3 px-4 py-3">
                                    <button type="button" onClick={() => setOpenHolding(h)} aria-label={`Open ${h.name}`}
                                            className="min-w-0 flex-1 flex items-center gap-3 text-left -my-1 py-1 rounded-control hover:bg-surface-sunken/60">
                                    <span aria-hidden className="shrink-0 w-2 h-8 rounded-full" style={{ background: typeColor(h.type) }} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-body text-ink truncate">{h.name}</span>
                                        <span className="block text-small text-ink-3 num">
                                            {h.type}
                                            {h.type === "IPO" && h.ipoStatus && (
                                                <> · {IPO_STATUSES.find(st => st.value === h.ipoStatus)?.label.split(" — ")[0] || h.ipoStatus}</>
                                            )}
                                            {" · "}₹{fmt(h.investedAmount)} in
                                            {h.source && <> · from {h.source === "KFINTECH" ? "KFintech" : h.source}</>}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-right">
                                        <span className="block text-body font-semibold text-ink num">
                                            ₹{fmt0(h.currentValue)}
                                            {ESTIMATED_TYPES.has(h.type) && (
                                                <span className="ml-1 text-caption font-normal text-ink-3" title="Projected from the interest rate, not a market price">est.</span>
                                            )}
                                        </span>
                                        <span className={cx("block text-small num", pos ? "text-good" : "text-bad")}>
                                            {pos ? "+" : "−"}₹{fmt0(Math.abs(h.pnl ?? 0))} · {pos ? "+" : ""}{h.pnlPercent}%
                                        </span>
                                        {h.xirr != null && (
                                            <span className="block text-caption text-ink-3 num"
                                                  title={h.xirrEstimated ? "Worked out from the amount and date, as one lump sum" : "XIRR from the statement's transactions"}>
                                                {h.xirr}% a year{h.xirrEstimated ? " (est.)" : ""}
                                            </span>
                                        )}
                                    </span>
                                    </button>
                                    <span className="shrink-0 hidden sm:flex -mr-2">
                                        <button type="button" onClick={() => openEdit(h)} aria-label={`Edit ${h.name}`}
                                                className="w-8 h-8 rounded-full flex items-center justify-center text-ink-3 hover:bg-surface-sunken">
                                            <Pencil size={15} aria-hidden />
                                        </button>
                                        <button type="button" onClick={() => handleDelete(h.id)} disabled={deleting === h.id} aria-label={`Delete ${h.name}`}
                                                className="w-8 h-8 rounded-full flex items-center justify-center text-ink-3 hover:bg-surface-sunken">
                                            <Trash2 size={15} aria-hidden />
                                        </button>
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                    </section>
                    ))}
                </>
            )}
        </div>

            {/* Wide screens: the facts about the whole portfolio sit beside the holdings */}
            {wide && holdings.length > 0 && (
                <aside className="space-y-5 lg:sticky lg:top-6" aria-label="About your portfolio">
                    <AllocationCard donut holdings={holdings} navigateTo={gotoSection} />
                    <TopMovers holdings={holdings} />
                    <TopInsight health={health} navigateTo={gotoSection} />
                </aside>
            )}

            {/* Auto-detect confirm modal */}
            {detected !== null && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
                    <div className="relative w-full max-w-lg bg-surface rounded-t-[24px] sm:rounded-card p-5 max-h-[85vh] flex flex-col">
                        

                        <div className="flex items-center justify-between mb-1">
                            <h3 className="text-title text-ink">Found in your transactions</h3>
                            <span className="text-small text-ink-3">{detected.length} found</span>
                        </div>
                        <p className="text-small text-ink-3 mb-4">
                            Put in = everything paid to each one. Value starts the same; update it after adding.
                        </p>

                        {detected.length === 0 ? (
                            <div className="text-center py-10 text-ink-3 text-small">
                                No investment transactions detected in your bank history.
                            </div>
                        ) : (
                            <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                                {detected.map((item, i) => (
                                    <label
                                        key={i}
                                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                                            selected[i]
                                                ? "border-accent bg-accent-soft"
                                                : "border-line bg-surface"
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            className="mt-0.5 w-4 h-4 accent-[var(--accent)]"
                                            checked={!!selected[i]}
                                            onChange={(e) => setSelected({ ...selected, [i]: e.target.checked })}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-body text-ink truncate">{item.name}</span>
                                                <span className="text-body font-semibold text-ink num whitespace-nowrap">
                                                    ₹{item.investedAmount?.toLocaleString("en-IN")}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                                                    background: (TYPE_COLORS[item.type] || "#94a3b8") + "20",
                                                    color: TYPE_COLORS[item.type] || "#94a3b8"
                                                }}>{item.type}</span>
                                                {item.purchaseDate && (
                                                    <span className="text-small text-ink-3">since {item.purchaseDate}</span>
                                                )}
                                            </div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        )}

                        <div className="flex gap-2 mt-4 pt-4 border-t border-line">
                            <button
                                onClick={() => { setDetected(null); setSelected({}); }}
                                className="flex-1 h-11 rounded-full bg-surface-sunken text-ink text-body font-semibold"
                            >
                                Cancel
                            </button>
                            {detected.length > 0 && (
                                <button
                                    onClick={handleImport}
                                    disabled={importing || !Object.values(selected).some(Boolean)}
                                    className="flex-1 h-11 rounded-full bg-accent-strong text-white text-body font-semibold disabled:opacity-40"
                                >
                                    {importing ? "Importing..." : `Add ${Object.values(selected).filter(Boolean).length}`}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
                    <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-surface rounded-t-[24px] sm:rounded-card p-5">
                        
                        <h3 className="text-title text-ink mb-4">{editId ? "Edit investment" : "Add investment"}</h3>

                        <div className="space-y-3">
                            <div>
                                <label className="text-small text-ink-2 mb-1 block">Name *</label>
                                <input
                                    className="w-full h-11 rounded-control bg-surface-sunken border border-transparent px-3 text-body text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent"
                                    placeholder="e.g. Nifty 50 Index Fund"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="text-small text-ink-2 mb-1 block">Type</label>
                                <select
                                    className="w-full h-11 rounded-control bg-surface-sunken border border-transparent px-3 text-body text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent"
                                    value={form.type}
                                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                                >
                                    {INVESTMENT_TYPES.map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>

                            {form.type === "IPO" && (
                                <div>
                                    <label htmlFor="ipo-status" className="text-small text-ink-2 mb-1 block">Application status</label>
                                    <select
                                        id="ipo-status"
                                        className="w-full h-11 rounded-control bg-surface-sunken border border-transparent px-3 text-body text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent"
                                        value={form.ipoStatus}
                                        onChange={(e) => setForm({ ...form, ipoStatus: e.target.value })}
                                    >
                                        {IPO_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                    </select>
                                    <p className="text-caption text-ink-3 mt-1">
                                        Amount = what was blocked or paid. Once listed, add the NSE symbol and shares to track the live price.
                                    </p>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-small text-ink-2 mb-1 block">Invested Amount (₹) *</label>
                                    <input
                                        type="number"
                                        className="w-full h-11 rounded-control bg-surface-sunken border border-transparent px-3 text-body text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent"
                                        placeholder="50000"
                                        value={form.investedAmount}
                                        onChange={(e) => setForm({ ...form, investedAmount: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-small text-ink-2 mb-1 block">Current Value (₹)</label>
                                    <input
                                        type="number"
                                        className="w-full h-11 rounded-control bg-surface-sunken border border-transparent px-3 text-body text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent"
                                        placeholder="Same as invested"
                                        value={form.currentValue}
                                        onChange={(e) => setForm({ ...form, currentValue: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-small text-ink-2 mb-1 block">Purchase Date</label>
                                <input
                                    type="date"
                                    className="w-full h-11 rounded-control bg-surface-sunken border border-transparent px-3 text-body text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent"
                                    value={form.purchaseDate}
                                    onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                                />
                            </div>

                            {/* Context-sensitive live-price fields */}
                            {TYPE_FIELDS[form.type]?.ticker && (
                                <div>
                                    <label className="text-small text-ink-2 mb-1 block">{TYPE_FIELDS[form.type].ticker}</label>
                                    <input
                                        className="w-full h-11 rounded-control bg-surface-sunken border border-transparent px-3 text-body text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent"
                                        placeholder={form.type === "Mutual Fund" ? "e.g. 120716" : form.type === "IPO" ? "e.g. NEWCO — leave empty until it lists" : "e.g. TCS"}
                                        value={form.tickerCode}
                                        onChange={(e) => { setForm({ ...form, tickerCode: e.target.value }); symbolSearch.setQuery(e.target.value); }}
                                    />
                                    {symbolSearch.state === "done" && symbolSearch.results.length > 0 && (
                                        <ul className="mt-1 max-h-48 overflow-y-auto rounded-[14px] border border-line bg-surface p-1 shadow-[0_12px_32px_rgba(17,17,26,0.12)]" style={{ listStyle: "none", margin: 0, padding: 4 }}>
                                            {symbolSearch.results.slice(0, 6).map(r => {
                                                const symbol = form.type === "Mutual Fund" ? r.code : r.symbol.replace(/\.NS$/, "");
                                                return (
                                                    <li key={symbol}>
                                                        <button
                                                            type="button"
                                                            onClick={() => { setForm(f => ({ ...f, tickerCode: symbol })); symbolSearch.setQuery(""); }}
                                                            className="w-full text-left px-3 py-2 rounded-[10px] hover:bg-surface-sunken"
                                                        >
                                                            <span className="block text-small text-ink">{r.name}</span>
                                                            <span className="block text-caption text-ink-3">{symbol}{r.exchange ? ` · ${r.exchange}` : ""}</span>
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                    <p className="text-caption text-ink-3 mt-1">
                                        {symbolSearch.state === "done" && symbolSearch.results.length === 0
                                            ? `Nothing on the exchange matches "${symbolSearch.query}" — check the spelling.`
                                            : form.type === "Mutual Fund" ? "Start typing the fund's name and pick it from the list"
                                            : "Start typing the company's name and pick it from the list"}
                                    </p>
                                </div>
                            )}

                            {TYPE_FIELDS[form.type]?.units && (
                                <div>
                                    <label className="text-small text-ink-2 mb-1 block">{TYPE_FIELDS[form.type].units}</label>
                                    <input
                                        type="number"
                                        className="w-full h-11 rounded-control bg-surface-sunken border border-transparent px-3 text-body text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent"
                                        placeholder="0"
                                        value={form.units}
                                        onChange={(e) => setForm({ ...form, units: e.target.value })}
                                    />
                                </div>
                            )}

                            {TYPE_FIELDS[form.type]?.rate && (
                                <div>
                                    <label className="text-small text-ink-2 mb-1 block">{TYPE_FIELDS[form.type].rate}</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        className="w-full h-11 rounded-control bg-surface-sunken border border-transparent px-3 text-body text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent"
                                        placeholder={form.type === "Fixed Deposit" ? "7.1" : "7.5"}
                                        value={form.interestRate}
                                        onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
                                    />
                                </div>
                            )}

                            {["PPF", "NPS"].includes(form.type) && (
                                <div className="px-3 py-2 rounded-control bg-info-soft text-small text-info">
                                    {form.type === "PPF" ? "PPF rate: 7.1% p.a. (auto-calculated)" : "NPS estimated return: 9% p.a. (auto-calculated)"}
                                </div>
                            )}

                            <div>
                                <label className="text-small text-ink-2 mb-1 block">Notes</label>
                                <input
                                    className="w-full h-11 rounded-control bg-surface-sunken border border-transparent px-3 text-body text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent"
                                    placeholder="Optional"
                                    value={form.notes}
                                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowModal(false)}
                                className="flex-1 h-11 rounded-full bg-surface-sunken text-ink text-body font-semibold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || !form.name.trim() || !form.investedAmount}
                                className="flex-1 h-11 rounded-full bg-accent-strong text-white text-body font-semibold disabled:opacity-40"
                            >
                                {saving ? "Saving..." : editId ? "Update" : "Add"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {linking && (
                <LinkHoldingModal
                    holding={linking}
                    onClose={() => setLinking(null)}
                    onLinked={() => { setLinking(null); load(); }}
                    onOther={(h) => { setLinking(null); openEdit(h); }}
                />
            )}
        </div>
    );
}
