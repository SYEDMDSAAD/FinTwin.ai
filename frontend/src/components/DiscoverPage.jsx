import { useCallback, useEffect, useRef, useState } from "react";
import { Rocket, Landmark, LineChart, Star, Plus, Search, X } from "lucide-react";
import toast from "react-hot-toast";
import API from "../services/api";
import { IPO_STATUSES } from "../constants/investments";

// Discover: where the user can put money, shown as facts — IPOs (from the
// admin-maintained catalog), mutual funds (AMFI NAVs and past returns) and
// stocks (live NSE/BSE prices). Nothing here says what to buy: personal
// recommendations would be investment advice, which is SEBI-regulated.

const TABS = [
    { id: "ipos",   label: "IPOs",         icon: Rocket },
    { id: "funds",  label: "Mutual funds", icon: Landmark },
    { id: "stocks", label: "Stocks",       icon: LineChart },
];

const inr = (n, digits = 0) =>
    n === null || n === undefined || Number.isNaN(Number(n))
        ? "—"
        : "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });

const pct = (n) => (n === null || n === undefined ? "—" : `${n > 0 ? "+" : ""}${Number(n).toFixed(2)}%`);
const tone = (n) => (n > 0 ? "#4ade80" : n < 0 ? "#f87171" : "var(--text-secondary)");
const shortDate = (iso) =>
    iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";

const CARD = { background: "var(--bg-card)", border: "1px solid var(--border-card)", borderRadius: 16, padding: 16 };
const MUTED = { fontSize: 12, color: "var(--text-secondary)" };
const INPUT = {
    width: "100%", padding: "10px 12px 10px 36px", borderRadius: 12, border: "1px solid var(--border-card)",
    background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box",
};
const SMALL_BTN = {
    display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 10,
    border: "1px solid var(--border-card)", background: "var(--bg-subtle)", color: "var(--text-primary)",
    fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};

export default function DiscoverPage() {
    const [tab, setTab] = useState("ipos");
    const [holding, setHolding] = useState(null);   // prefill for "add to portfolio"
    const [watchlist, setWatchlist] = useState([]);

    const loadWatchlist = useCallback(() =>
        API.get("/watchlist").then(r => setWatchlist(Array.isArray(r.data) ? r.data : [])).catch(() => {}), []);
    useEffect(() => { loadWatchlist(); }, [loadWatchlist]);

    const follow = async (kind, symbol, name) => {
        try {
            await API.post("/watchlist", { kind, symbol, name });
            toast.success(`Following ${name}`);
            loadWatchlist();
        } catch (e) {
            toast.error(e?.response?.data?.error || "Couldn't add to your watchlist");
        }
    };
    const unfollow = async (item) => {
        setWatchlist(w => w.filter(i => i.id !== item.id));
        try { await API.delete(`/watchlist/${item.id}`); } catch { loadWatchlist(); }
    };
    const isFollowed = (kind, symbol) =>
        watchlist.some(i => i.kind === kind && i.symbol === String(symbol).toUpperCase());

    return (
        <div style={{ maxWidth: 960 }}>
            <div style={{ marginBottom: 18 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>Discover</h2>
                <p style={{ ...MUTED, margin: "4px 0 0" }}>
                    IPOs, mutual funds and stocks you can invest in — prices, NAVs and past returns. Information, not advice: past returns don't promise future ones.
                </p>
            </div>

            <div role="tablist" aria-label="Discover" style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
                {TABS.map(t => (
                    <button
                        key={t.id}
                        role="tab"
                        aria-selected={tab === t.id}
                        onClick={() => setTab(t.id)}
                        style={{
                            ...SMALL_BTN, padding: "8px 14px", fontSize: 13,
                            background: tab === t.id ? "rgba(167,139,250,0.15)" : "var(--bg-subtle)",
                            borderColor: tab === t.id ? "rgba(167,139,250,0.5)" : "var(--border-card)",
                        }}
                    >
                        <t.icon size={14} aria-hidden /> {t.label}
                    </button>
                ))}
            </div>

            {tab === "ipos" && <IposTab onTrack={setHolding} />}
            {tab === "funds" && (
                <FundsTab watchlist={watchlist.filter(i => i.kind === "FUND")} isFollowed={isFollowed}
                          follow={follow} unfollow={unfollow} onAdd={setHolding} />
            )}
            {tab === "stocks" && (
                <StocksTab watchlist={watchlist.filter(i => i.kind === "STOCK")} isFollowed={isFollowed}
                           follow={follow} unfollow={unfollow} onAdd={setHolding} />
            )}

            {holding && <AddHoldingModal prefill={holding} onClose={() => setHolding(null)} />}
        </div>
    );
}

// ── IPOs ─────────────────────────────────────────────────────────────────────

const IPO_GROUPS = [
    { status: "OPEN",     title: "Open now" },
    { status: "UPCOMING", title: "Upcoming" },
    { status: "CLOSED",   title: "Closed — awaiting listing" },
    { status: "LISTED",   title: "Recently listed" },
];

export function IposTab({ onTrack }) {
    const [ipos, setIpos] = useState(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        API.get("/discover/ipos")
            .then(r => setIpos(Array.isArray(r.data) ? r.data : []))
            .catch(() => setFailed(true));
    }, []);

    if (failed) return <p style={MUTED}>IPOs couldn't be loaded. Try again shortly.</p>;
    if (!ipos) return <p style={MUTED}>Loading IPOs…</p>;
    if (ipos.length === 0) {
        return (
            <div style={CARD}>
                <p style={{ ...MUTED, margin: 0 }}>No IPOs are listed here right now. New issues appear as they're announced.</p>
            </div>
        );
    }

    return (
        <div style={{ display: "grid", gap: 20 }}>
            {IPO_GROUPS.map(g => {
                const rows = ipos.filter(i => i.status === g.status);
                if (rows.length === 0) return null;
                return (
                    <section key={g.status} aria-label={g.title}>
                        <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-label)", letterSpacing: "0.06em", margin: "0 0 10px", textTransform: "uppercase" }}>
                            {g.title}
                        </h3>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                            {rows.map(ipo => <IpoCard key={ipo.id} ipo={ipo} onTrack={onTrack} />)}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}

function IpoCard({ ipo, onTrack }) {
    const price = ipo.issuePrice != null
        ? inr(ipo.issuePrice, 2)
        : ipo.priceBandLow != null && ipo.priceBandHigh != null
            ? `${inr(ipo.priceBandLow)}–${inr(ipo.priceBandHigh)}`
            : "Price TBA";
    const listed = ipo.status === "LISTED";

    return (
        <article style={CARD}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{ipo.name}</div>
                    <div style={MUTED}>{ipo.symbol ? `NSE: ${ipo.symbol}` : "Symbol after listing"}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, border: "1px solid var(--border-card)", color: "var(--text-secondary)" }}>
                    {ipo.category}
                </span>
            </div>

            <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px", margin: "0 0 12px", fontSize: 12 }}>
                <Fact label={ipo.issuePrice != null ? "Issue price" : "Price band"} value={price} />
                <Fact label="Lot" value={ipo.lotSize ? `${ipo.lotSize} shares` : "—"} />
                <Fact label="Min. investment" value={inr(ipo.minInvestment)} />
                {listed
                    ? <Fact label="Listed" value={shortDate(ipo.listingDate)} />
                    : <Fact label="Bidding" value={`${shortDate(ipo.openDate)} – ${shortDate(ipo.closeDate)}`} />}
            </dl>

            {listed && ipo.currentPrice != null && (
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>{inr(ipo.currentPrice, 2)}</span>
                    {ipo.gainPct != null && (
                        <span style={{ fontSize: 13, fontWeight: 700, color: tone(ipo.gainPct) }}>{pct(ipo.gainPct)} vs issue</span>
                    )}
                </div>
            )}

            {ipo.notes && <p style={{ ...MUTED, margin: "0 0 12px", lineHeight: 1.5 }}>{ipo.notes}</p>}

            <button
                type="button"
                style={SMALL_BTN}
                onClick={() => onTrack({
                    type: "IPO", name: ipo.name, ipoListingId: ipo.id,
                    investedAmount: ipo.minInvestment ?? "",
                    ipoStatus: listed ? "LISTED" : "APPLIED",
                    tickerCode: listed ? (ipo.symbol || "") : "",
                })}
            >
                <Plus size={13} aria-hidden /> Track my application
            </button>
        </article>
    );
}

function Fact({ label, value }) {
    return (
        <div>
            <dt style={{ color: "var(--text-secondary)", fontSize: 11 }}>{label}</dt>
            <dd style={{ margin: 0, color: "var(--text-primary)", fontWeight: 600 }}>{value}</dd>
        </div>
    );
}

// ── Mutual funds ─────────────────────────────────────────────────────────────

function useDebouncedSearch(path, delay = 350) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [state, setState] = useState("idle");        // idle | loading | done | failed
    const seq = useRef(0);

    const q = query.trim();
    const tooShort = q.length < 2;

    useEffect(() => {
        if (tooShort) { seq.current++; return undefined; }   // drop any reply still in flight
        const mine = ++seq.current;
        const t = setTimeout(() => {
            setState("loading");
            API.get(path, { params: { q } })
                .then(r => { if (mine === seq.current) { setResults(Array.isArray(r.data) ? r.data : []); setState("done"); } })
                .catch(() => { if (mine === seq.current) setState("failed"); });
        }, delay);
        return () => clearTimeout(t);
    }, [q, tooShort, path, delay]);

    // Too short to search: idle, whatever the last search left behind
    return { query, setQuery, results: tooShort ? [] : results, state: tooShort ? "idle" : state };
}

function SearchBox({ value, onChange, placeholder, label }) {
    return (
        <div style={{ position: "relative", marginBottom: 14 }}>
            <Search size={15} aria-hidden style={{ position: "absolute", left: 12, top: 12, color: "var(--text-secondary)" }} />
            <input aria-label={label} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={INPUT} />
        </div>
    );
}

export function FundsTab({ watchlist, isFollowed, follow, unfollow, onAdd }) {
    const { query, setQuery, results, state } = useDebouncedSearch("/discover/funds");
    const [open, setOpen] = useState(null);

    return (
        <div>
            {watchlist.length > 0 && (
                <section aria-label="Funds you follow" style={{ ...CARD, marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-label)", marginBottom: 8 }}>FUNDS YOU FOLLOW</div>
                    {watchlist.map(w => (
                        <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                            <button type="button" onClick={() => setOpen(open === w.symbol ? null : w.symbol)}
                                    style={{ flex: 1, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", color: "var(--text-primary)", fontSize: 13, fontWeight: 600 }}>
                                {w.name}
                            </button>
                            <button type="button" aria-label={`Stop following ${w.name}`} onClick={() => unfollow(w)} style={{ ...SMALL_BTN, padding: 5 }}>
                                <X size={13} aria-hidden />
                            </button>
                        </div>
                    ))}
                    {open && watchlist.some(w => w.symbol === open) && <FundDetails key={open} code={open} />}
                </section>
            )}

            <SearchBox value={query} onChange={setQuery} label="Search mutual funds"
                       placeholder="Search by fund, AMC or category — e.g. flexi cap, parag parikh, liquid" />
            {state === "loading" && <p style={MUTED}>Searching…</p>}
            {state === "failed" && <p style={MUTED}>Fund data is unavailable right now. Try again shortly.</p>}
            {state === "done" && results.length === 0 && <p style={MUTED}>No funds match "{query}".</p>}

            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                {results.map(f => (
                    <li key={f.code} style={CARD}>
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                            <button type="button" onClick={() => setOpen(open === f.code ? null : f.code)} aria-expanded={open === f.code}
                                    style={{ flex: "1 1 260px", textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{f.name}</div>
                                <div style={MUTED}>{f.amc} · {f.category}</div>
                            </button>
                            <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{inr(f.nav, 2)}</div>
                                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>NAV · {f.nav_date}</div>
                            </div>
                        </div>
                        {open === f.code && <FundDetails key={f.code} code={f.code} />}
                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                            <button type="button" style={SMALL_BTN} disabled={isFollowed("FUND", f.code)}
                                    onClick={() => follow("FUND", f.code, f.name)}>
                                <Star size={13} aria-hidden /> {isFollowed("FUND", f.code) ? "Following" : "Follow"}
                            </button>
                            <button type="button" style={SMALL_BTN}
                                    onClick={() => onAdd({ type: "Mutual Fund", name: f.name, tickerCode: f.code })}>
                                <Plus size={13} aria-hidden /> Add to portfolio
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function FundDetails({ code }) {
    // Mounted fresh per fund (key={code}), so there's no stale state to reset
    const [d, setD] = useState(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let alive = true;
        API.get(`/discover/funds/${code}`)
            .then(r => { if (alive) setD(r.data); })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [code]);

    if (failed) return <p style={{ ...MUTED, margin: "10px 0 0" }}>Details are unavailable right now.</p>;
    if (!d) return <p style={{ ...MUTED, margin: "10px 0 0" }}>Loading returns…</p>;
    const r = d.returns || {};
    const has = Object.keys(r).length > 0;
    return (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}>
            {has ? (
                <div style={{ display: "flex", gap: 18 }}>
                    {["1y", "3y", "5y"].map(k => (
                        <div key={k}>
                            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{k.replace("y", " yr")}{k !== "1y" ? " / yr" : ""}</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: r[k] == null ? "var(--text-secondary)" : tone(r[k]) }}>{pct(r[k])}</div>
                        </div>
                    ))}
                </div>
            ) : (
                <p style={{ ...MUTED, margin: 0 }}>Past returns are unavailable right now — the NAV above is current.</p>
            )}
            <p style={{ fontSize: 11, color: "var(--text-dim)", margin: "8px 0 0" }}>
                Trailing returns from NAV history (3 and 5 years annualised). Scheme code {d.code}{d.isin ? ` · ISIN ${d.isin}` : ""}.
            </p>
        </div>
    );
}

// ── Stocks ───────────────────────────────────────────────────────────────────

const QUOTE_REFRESH_MS = 60_000;

export function StocksTab({ watchlist, isFollowed, follow, unfollow, onAdd }) {
    const { query, setQuery, results, state } = useDebouncedSearch("/discover/stocks");
    const [quotes, setQuotes] = useState({});
    const symbols = watchlist.map(w => w.symbol).join(",");

    useEffect(() => {
        if (!symbols) return undefined;
        const load = () => API.get("/discover/stocks/quotes", { params: { symbols } })
            .then(r => setQuotes(Object.fromEntries((r.data || []).map(q => [q.symbol, q]))))
            .catch(() => {});
        load();
        const id = setInterval(load, QUOTE_REFRESH_MS);
        return () => clearInterval(id);
    }, [symbols]);

    const quoteFor = (symbol) => quotes[symbol] || quotes[symbol.includes(".") ? symbol : `${symbol}.NS`];

    return (
        <div>
            <section aria-label="Your watchlist" style={{ ...CARD, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-label)", marginBottom: 8 }}>YOUR WATCHLIST</div>
                {watchlist.length === 0 ? (
                    <p style={{ ...MUTED, margin: 0 }}>Search below and follow stocks to see their live prices here.</p>
                ) : (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                        {watchlist.map(w => {
                            const q = quoteFor(w.symbol);
                            return (
                                <li key={w.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--border-subtle)" }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{w.name}</div>
                                        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{w.symbol}</div>
                                    </div>
                                    <div style={{ textAlign: "right" }}>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{q?.price != null ? inr(q.price, 2) : "—"}</div>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: tone(q?.changePct) }}>{q?.changePct != null ? `${pct(q.changePct)} today` : ""}</div>
                                    </div>
                                    <button type="button" style={SMALL_BTN}
                                            onClick={() => onAdd({ type: "Stocks", name: w.name, tickerCode: w.symbol.replace(/\.(NS|BO)$/, "") })}>
                                        <Plus size={13} aria-hidden /> Holding
                                    </button>
                                    <button type="button" aria-label={`Stop following ${w.name}`} onClick={() => unfollow(w)} style={{ ...SMALL_BTN, padding: 5 }}>
                                        <X size={13} aria-hidden />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            <SearchBox value={query} onChange={setQuery} label="Search stocks" placeholder="Search NSE/BSE stocks — e.g. HDFC Bank, Tata Motors" />
            {state === "loading" && <p style={MUTED}>Searching…</p>}
            {state === "failed" && <p style={MUTED}>Stock search is unavailable right now. Try again shortly.</p>}
            {state === "done" && results.length === 0 && <p style={MUTED}>No NSE/BSE stocks match "{query}".</p>}
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                {results.map(s => (
                    <li key={s.symbol} style={{ ...CARD, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 200px" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{s.name}</div>
                            <div style={MUTED}>{s.symbol} · {s.exchange}</div>
                        </div>
                        <button type="button" style={SMALL_BTN} disabled={isFollowed("STOCK", s.symbol)}
                                onClick={() => follow("STOCK", s.symbol, s.name)}>
                            <Star size={13} aria-hidden /> {isFollowed("STOCK", s.symbol) ? "Following" : "Follow"}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}

// ── Add to portfolio ─────────────────────────────────────────────────────────

export function AddHoldingModal({ prefill, onClose }) {
    const isIpo = prefill.type === "IPO";
    const [form, setForm] = useState({
        name: prefill.name || "",
        investedAmount: prefill.investedAmount ?? "",
        units: "",
        tickerCode: prefill.tickerCode || "",
        ipoStatus: prefill.ipoStatus || "APPLIED",
    });
    const [saving, setSaving] = useState(false);
    const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

    const save = async () => {
        if (!form.name.trim() || !form.investedAmount) return;
        setSaving(true);
        try {
            const invested = parseFloat(form.investedAmount);
            await API.post("/portfolio", {
                name: form.name.trim(),
                type: prefill.type,
                investedAmount: invested,
                currentValue: invested,
                tickerCode: form.tickerCode.trim() || null,
                units: form.units !== "" ? parseFloat(form.units) : null,
                ipoStatus: isIpo ? form.ipoStatus : null,
                ipoListingId: isIpo ? prefill.ipoListingId ?? null : null,
            });
            toast.success(`${form.name.trim()} added to your portfolio`);
            onClose();
        } catch (e) {
            toast.error(e?.response?.data?.error || "Couldn't add it. Try again.");
        } finally {
            setSaving(false);
        }
    };

    const field = { display: "block", width: "100%", padding: "9px 11px", borderRadius: 10, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", marginTop: 4 };
    const label = { display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 };

    return (
        <div role="dialog" aria-modal="true" aria-label={`Add ${prefill.type} to portfolio`}
             style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}
             onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{ ...CARD, width: "100%", maxWidth: 420, background: "var(--bg-floating)", padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
                    <h3 style={{ margin: 0, flex: 1, fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                        {isIpo ? "Track your IPO application" : `Add ${prefill.type === "Stocks" ? "stock" : "fund"} to portfolio`}
                    </h3>
                    <button type="button" aria-label="Close" onClick={onClose} style={{ ...SMALL_BTN, padding: 5 }}><X size={14} /></button>
                </div>

                <label style={label}>Name<input style={field} value={form.name} onChange={set("name")} /></label>
                {isIpo && (
                    <label style={label}>Status
                        <select style={field} value={form.ipoStatus} onChange={set("ipoStatus")}>
                            {IPO_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </label>
                )}
                <label style={label}>
                    {isIpo ? "Amount applied or paid (₹)" : "Amount invested (₹)"}
                    <input style={field} type="number" min="0" value={form.investedAmount} onChange={set("investedAmount")} />
                </label>
                <label style={label}>
                    {prefill.type === "Mutual Fund" ? "Units held" : isIpo ? "Shares allotted (once allotted)" : "Shares"}
                    <input style={field} type="number" min="0" value={form.units} onChange={set("units")} />
                </label>
                {!isIpo || form.ipoStatus === "LISTED" ? (
                    <label style={label}>
                        {prefill.type === "Mutual Fund" ? "AMFI scheme code" : "NSE symbol"}
                        <input style={field} value={form.tickerCode} onChange={set("tickerCode")} />
                    </label>
                ) : null}
                <p style={{ fontSize: 11, color: "var(--text-dim)", margin: "0 0 14px", lineHeight: 1.5 }}>
                    {isIpo
                        ? "Until it lists this holding is worth what you applied with. Once listed, add the NSE symbol and shares to track the live price against the issue price."
                        : "With units and the code, FinTwin values this at the live price when you refresh your portfolio."}
                </p>
                <button type="button" onClick={save} disabled={saving || !form.name.trim() || !form.investedAmount}
                        style={{ width: "100%", padding: "11px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#a78bfa,#7c3aed)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>
                    {saving ? "Saving…" : "Save to portfolio"}
                </button>
            </div>
        </div>
    );
}
