import { useCallback, useEffect, useState } from "react";
import { Sparkles, ChevronDown, Plus } from "lucide-react";
import toast from "react-hot-toast";
import API from "../services/api";

// Payments that look like investments — a broker or fund the rules know, or
// anything the user filed under Investments — offered as holdings. Adding one
// creates it with the amount paid; the portfolio's own banner then asks where
// it actually went, so it can be valued at a live price.
//
// Repeated payments to one payee are one investment or several, and only the
// user knows which: monthly SIPs into a fund are one holding, while seven
// payments to a broker can be seven different stocks. So each suggestion can
// go in either way, and the default follows the payee — a recognised fund or
// scheme is treated as one, an unrecognised payee as separate.
//
// Collapsed by default: this sits above the portfolio and shouldn't push it
// down. Dismissals last for this visit only — nothing is written to the server.

const inr = (n) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const onDate = (iso) => (iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    : null);
const fullDate = (iso) => (iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "");

// One instrument gets paid into again and again; a broker or an unknown payee
// takes payments for different things each time.
const ONE_HOLDING_TYPES = new Set(["Mutual Fund", "PPF", "NPS", "Fixed Deposit", "Bonds"]);
const defaultSplit = (item) => (item.payments || 1) > 1 && !ONE_HOLDING_TYPES.has(item.type);

export default function InvestmentSuggestions({ onAdded }) {
    const [items, setItems] = useState([]);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(null);
    const [hidden, setHidden] = useState(() => new Set());
    // name → true when its payments should become one holding each
    const [split, setSplit] = useState({});

    const load = useCallback(() =>
        API.get("/portfolio/auto-detect")
            .then(r => setItems(Array.isArray(r.data) ? r.data : []))
            .catch(() => setItems([])), []);
    useEffect(() => { load(); }, [load]);

    const shown = items.filter(i => !hidden.has(i.name));
    if (shown.length === 0) return null;

    const total = shown.reduce((sum, i) => sum + (i.investedAmount || 0), 0);
    const payments = shown.reduce((sum, i) => sum + (i.payments || 1), 0);

    const separately = (item) => split[item.name] ?? defaultSplit(item);

    const add = async (item) => {
        const apart = separately(item) && (item.breakdown?.length || 0) > 1;
        // Each payment keeps its own date and amount, so each can be linked to
        // a different stock or fund
        const holdings = apart
            ? item.breakdown.map(p => ({
                name: `${item.name} · ${fullDate(p.date)}`,
                type: item.type,
                investedAmount: p.amount,
                currentValue: p.amount,
                purchaseDate: p.date,
            }))
            : [{
                name: item.name,
                type: item.type,
                investedAmount: item.investedAmount,
                currentValue: item.currentValue,
                purchaseDate: item.purchaseDate,
            }];

        setBusy(item.name);
        try {
            for (const holding of holdings) await API.post("/portfolio", holding);
            setItems(list => list.filter(i => i.name !== item.name));
            toast.success(holdings.length > 1
                ? `${holdings.length} holdings added — tell us where each one went`
                : `${item.name} added — tell us where it went to see today's value`);
            onAdded?.();
        } catch {
            toast.error("Couldn't add that. Try again.");
        } finally {
            setBusy(null);
        }
    };

    return (
        <section aria-label="Possible investments" style={{ background: "var(--bg-card)", border: "1px solid rgba(34,211,238,0.3)", borderRadius: 16, padding: open ? 18 : "12px 18px", marginBottom: 18 }}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
            >
                <Sparkles size={16} color="#22d3ee" aria-hidden />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                    {inr(total)} across {payments} {payments === 1 ? "payment" : "payments"} looks like investing
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                    {open ? "Hide" : `Review ${shown.length}`}
                </span>
                <ChevronDown size={16} color="var(--text-secondary)" aria-hidden
                             style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
            </button>

            {open && (
                <div style={{ marginTop: 12 }}>
                    <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                        These came from your transactions — brokers and funds we recognise, plus anything you put in the
                        Investments category. Add one and we'll ask which stock or fund it went into, so it can be
                        valued at today's price. Where a payee was paid more than once, choose whether that's one
                        investment or one per payment.
                    </p>
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                        {shown.map(item => (
                            <li key={item.name} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {item.name}
                                    </div>
                                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                                        {item.type} · {inr(item.investedAmount)}
                                        {item.payments > 1 ? ` · ${item.payments} payments` : ""}
                                        {onDate(item.purchaseDate) ? ` · since ${onDate(item.purchaseDate)}` : ""}
                                    </div>
                                </div>
                                {(item.payments || 1) > 1 && (item.breakdown?.length || 0) > 1 && (
                                    <select
                                        aria-label={`How to add ${item.name}`}
                                        value={separately(item) ? "separate" : "one"}
                                        onChange={e => setSplit(s => ({ ...s, [item.name]: e.target.value === "separate" }))}
                                        style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}
                                    >
                                        <option value="separate">{item.payments} separate holdings</option>
                                        <option value="one">One holding</option>
                                    </select>
                                )}
                                <button
                                    type="button"
                                    disabled={busy === item.name}
                                    onClick={() => add(item)}
                                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#22d3ee,#0891b2)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                                >
                                    <Plus size={12} aria-hidden /> {busy === item.name ? "Adding…" : "Add to portfolio"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setHidden(h => new Set(h).add(item.name))}
                                    style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid var(--border-card)", background: "var(--bg-subtle)", color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                                >
                                    Not an investment
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}
