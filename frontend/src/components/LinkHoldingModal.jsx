import { useState } from "react";
import { Search, X, LineChart, Landmark, MoreHorizontal } from "lucide-react";
import toast from "react-hot-toast";
import API from "../services/api";
import { useDebouncedSearch } from "./discover/useDebouncedSearch";

// "I invested ₹15,000" becomes a real holding. Onboarding only asks for an
// amount, so the portfolio shows a sum that can never change value. The user
// says what it went into and when; the server looks up the price that day to
// work out the units, and values them at today's price.

const inr = (n, d = 0) =>
    n === null || n === undefined ? "—" : "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d });
const longDate = (iso) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const todayIso = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const KINDS = [
    { id: "STOCK", label: "A stock",         icon: LineChart,      search: "/discover/stocks", hint: "Search NSE/BSE — e.g. HDFC Bank" },
    { id: "FUND",  label: "A mutual fund",   icon: Landmark,       search: "/discover/funds",  hint: "Search by fund or AMC — e.g. parag parikh flexi" },
    { id: "OTHER", label: "Something else",  icon: MoreHorizontal },
];

export default function LinkHoldingModal({ holding, onClose, onLinked, onOther }) {
    const [kind, setKind] = useState(null);
    const [picked, setPicked] = useState(null);                 // {symbol, name}
    const [date, setDate] = useState(holding.purchaseDate || "");
    const [amount, setAmount] = useState(holding.investedAmount ?? "");
    const [units, setUnits] = useState("");
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(null);                    // "preview" | "save"

    const k = KINDS.find(x => x.id === kind);
    const search = useDebouncedSearch(k?.search || "/discover/stocks");

    const choose = (id) => {
        if (id === "OTHER") { onOther(holding); return; }
        setKind(id); setPicked(null); setPreview(null); search.setQuery("");
    };

    const body = () => ({
        kind, symbol: picked.symbol, name: picked.name, date,
        amount: parseFloat(amount), units: units === "" ? null : parseFloat(units),
    });
    const ready = picked && date && Number(amount) > 0;

    const runPreview = async () => {
        setBusy("preview");
        try {
            const r = await API.post("/portfolio/value-preview", body());
            setPreview(r.data);
        } catch (e) {
            setPreview(null);
            toast.error(e?.response?.data?.error || "Couldn't find a price for that date");
        } finally {
            setBusy(null);
        }
    };

    const save = async () => {
        setBusy("save");
        try {
            await API.post(`/portfolio/${holding.id}/link`, body());
            toast.success(`Linked to ${picked.name}`);
            onLinked();
        } catch (e) {
            toast.error(e?.response?.data?.error || "Couldn't save. Try again.");
        } finally {
            setBusy(null);
        }
    };

    const field = { display: "block", width: "100%", padding: "9px 11px", borderRadius: 10, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", marginTop: 4 };
    const label = { display: "block", fontSize: 12, color: "var(--text-secondary)" };
    const chip = (on) => ({
        display: "flex", alignItems: "center", gap: 6, flex: 1, padding: "10px 12px", borderRadius: 12, cursor: "pointer",
        border: `1px solid ${on ? "rgba(167,139,250,0.55)" : "var(--border-card)"}`,
        background: on ? "rgba(167,139,250,0.14)" : "var(--bg-subtle)", color: "var(--text-primary)",
        fontSize: 13, fontWeight: 600, fontFamily: "inherit",
    });

    return (
        <div role="dialog" aria-modal="true" aria-label="Where did you invest this?"
             style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}
             onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{ width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", background: "var(--bg-floating)", border: "1px solid var(--border-card)", borderRadius: 18, padding: 20 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
                    <div style={{ flex: 1 }}>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                            Where did you invest {inr(holding.investedAmount)}?
                        </h3>
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                            Tell us what it went into and when. We'll look up the price that day to work out what you hold, and show what it's worth today.
                        </p>
                    </div>
                    <button type="button" aria-label="Close" onClick={onClose}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: 4 }}>
                        <X size={16} />
                    </button>
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    {KINDS.map(x => (
                        <button key={x.id} type="button" aria-pressed={kind === x.id} style={chip(kind === x.id)} onClick={() => choose(x.id)}>
                            <x.icon size={14} aria-hidden /> {x.label}
                        </button>
                    ))}
                </div>

                {k && !picked && (
                    <div>
                        <div style={{ position: "relative" }}>
                            <Search size={14} aria-hidden style={{ position: "absolute", left: 11, top: 15, color: "var(--text-secondary)" }} />
                            <input aria-label={kind === "FUND" ? "Search mutual funds" : "Search stocks"} autoFocus
                                   style={{ ...field, paddingLeft: 32 }} placeholder={k.hint}
                                   value={search.query} onChange={e => search.setQuery(e.target.value)} />
                        </div>
                        {search.state === "loading" && <p style={{ ...label, marginTop: 8 }}>Searching…</p>}
                        {search.state === "failed" && <p style={{ ...label, marginTop: 8 }}>Search is unavailable right now. Try again shortly.</p>}
                        {search.state === "done" && search.results.length === 0 && <p style={{ ...label, marginTop: 8 }}>Nothing matches "{search.query}".</p>}
                        <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, maxHeight: 220, overflowY: "auto" }}>
                            {search.results.map(r => {
                                const symbol = kind === "FUND" ? r.code : r.symbol;
                                return (
                                    <li key={symbol}>
                                        <button type="button" onClick={() => setPicked({ symbol, name: r.name })}
                                                style={{ width: "100%", textAlign: "left", padding: "9px 10px", borderRadius: 10, border: "none", background: "none", cursor: "pointer", fontFamily: "inherit" }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{r.name}</div>
                                            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                                                {kind === "FUND" ? `${r.amc} · NAV ${inr(r.nav, 2)}` : `${r.symbol} · ${r.exchange}`}
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}

                {picked && (
                    <div style={{ display: "grid", gap: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 12, background: "var(--bg-subtle)", border: "1px solid var(--border-card)" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{picked.name}</div>
                                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{picked.symbol}</div>
                            </div>
                            <button type="button" onClick={() => { setPicked(null); setPreview(null); }}
                                    style={{ background: "none", border: "none", cursor: "pointer", color: "#a78bfa", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
                                Change
                            </button>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <label style={label}>Date you invested
                                <input type="date" style={field} value={date} max={todayIso()}
                                       onChange={e => { setDate(e.target.value); setPreview(null); }} />
                            </label>
                            <label style={label}>Amount (₹)
                                <input type="number" min="0" style={field} value={amount}
                                       onChange={e => { setAmount(e.target.value); setPreview(null); }} />
                            </label>
                        </div>
                        <label style={label}>
                            {kind === "FUND" ? "Units" : "Shares"} — only if you know the exact number
                            <input type="number" min="0" style={field} value={units} placeholder="We'll work it out from the price that day"
                                   onChange={e => { setUnits(e.target.value); setPreview(null); }} />
                        </label>

                        {!preview ? (
                            <button type="button" disabled={!ready || busy === "preview"} onClick={runPreview}
                                    style={{ padding: 11, borderRadius: 12, border: "1px solid rgba(167,139,250,0.4)", background: "rgba(167,139,250,0.12)", cursor: ready ? "pointer" : "default", fontFamily: "inherit", fontSize: 13, fontWeight: 700 }}>
                                <span style={{ color: "#a78bfa" }}>{busy === "preview" ? "Looking up prices…" : "Show today's value"}</span>
                            </button>
                        ) : (
                            <div role="status" style={{ padding: 14, borderRadius: 12, background: "var(--bg-subtle)", border: "1px solid var(--border-card)" }}>
                                <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                                    On {longDate(preview.purchaseDate)}, {inr(preview.amount)} bought{" "}
                                    <strong style={{ color: "var(--text-primary)" }}>{Number(preview.units).toLocaleString("en-IN", { maximumFractionDigits: 4 })} {kind === "FUND" ? "units" : "shares"}</strong>{" "}
                                    at {inr(preview.purchasePrice, 2)}.
                                </div>
                                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8 }}>
                                    <span style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)" }}>{inr(preview.currentValue)}</span>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: preview.gain >= 0 ? "#4ade80" : "#f87171" }}>
                                        {preview.gain >= 0 ? "+" : "−"}{inr(Math.abs(preview.gain))} ({preview.gainPct >= 0 ? "+" : ""}{preview.gainPct}%)
                                    </span>
                                </div>
                                <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                                    Today's {kind === "FUND" ? "NAV" : "price"}: {inr(preview.currentPrice, 2)}
                                </div>
                            </div>
                        )}

                        {preview && (
                            <button type="button" onClick={save} disabled={busy === "save"}
                                    style={{ padding: 12, borderRadius: 12, border: "none", background: "linear-gradient(135deg,#a78bfa,#7c3aed)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                                {busy === "save" ? "Saving…" : "Save to my portfolio"}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
