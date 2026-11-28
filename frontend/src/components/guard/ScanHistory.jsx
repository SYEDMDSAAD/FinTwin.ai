import { useState } from "react";
import { guard, guardError } from "../../services/guardApi";
import { inr, shortTime } from "./format";

// What became of a scanned payment, in the user's words
const STATUS = {
    pending: { text: "Waiting to confirm", cls: "sg-chip-warn" },
    paid: { text: "Paid", cls: "sg-chip-good" },
    not_paid: { text: "Didn't pay", cls: "" },
    skipped: { text: "Skipped", cls: "" },
    wishlist: { text: "On the wishlist", cls: "" },
};

function status(e) {
    if (e.choice === "paid" && e.notInStatement) return { text: "Not in your statement", cls: "sg-chip-warn" };
    if (e.choice === "paid" && e.detected) return { text: "Paid · found in your transactions", cls: "sg-chip-good" };
    if (STATUS[e.choice]) return STATUS[e.choice];
    if (e.decision === "insufficient") return { text: "Not enough money", cls: "sg-chip-crit" };
    return { text: "Not decided", cls: "" };
}

/**
 * The Scan tab's history: every payment Spend Guard checked and what became of
 * it. One still waiting (the UPI app was opened, the user hasn't said) can be
 * settled here: "I paid" takes it off the spending account, "I didn't pay"
 * leaves the money where it is.
 */
export default function ScanHistory({ items, onWallet, onFinTwinChanged }) {
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState("");
    const scans = (items || []).filter((e) => e.type === "scan");
    if (!scans.length) return null;

    // confirm: a payment waiting for an answer. keep-paid / undo-paid: one marked
    // paid that the statement didn't show, or "I paid" tapped by mistake.
    async function confirm(e, paid, action = "confirm") {
        setBusy(e.id);
        setError("");
        try {
            const body = action === "confirm" ? { eventId: e.id, paid }
                : action === "undo-paid" ? { eventId: e.id, why: e.notInStatement ? "not_in_statement" : "user" }
                : { eventId: e.id };
            const r = await guard(action, body);
            onWallet?.(r.wallet);
            if (r.recordedTransactionId) onFinTwinChanged?.();
        } catch (err) {
            setError(guardError(err));
        } finally {
            setBusy(null);
        }
    }

    return (
        <section className="sg-card" aria-labelledby="sg-scan-history">
            <div className="sg-h2" id="sg-scan-history">Scan history</div>
            {error && <div className="sg-error" role="alert" style={{ marginTop: 8 }}>{error}</div>}
            <ul className="sg-list" style={{ marginTop: 8 }}>
                {scans.map((e) => {
                    const st = status(e);
                    return (
                        <li key={e.id} style={{ flexWrap: "wrap" }}>
                            <div className="sg-list-main">
                                <div className="sg-list-title">{e.payeeName || e.category}</div>
                                <div className="sg-list-sub">
                                    <span className={`sg-chip ${st.cls}`}>{st.text}</span> · {e.category} · {shortTime(e.at)}
                                </div>
                            </div>
                            <div className="sg-list-value">{inr(e.amount)}</div>
                            {e.choice === "paid" && e.notInStatement && (
                                <div className="sg-row" style={{ flexBasis: "100%", marginTop: 8 }}>
                                    <span className="sg-sub" style={{ flex: 1 }}>
                                        Your bank statement didn't show this payment. Did you pay?
                                    </span>
                                    <button type="button" className="sg-btn sg-btn-sm" disabled={busy === e.id}
                                            onClick={() => confirm(e, true, "keep-paid")}>Yes, I paid</button>
                                    <button type="button" className="sg-btn sg-btn-sm sg-btn-primary" disabled={busy === e.id}
                                            onClick={() => confirm(e, false, "undo-paid")}>No, remove it</button>
                                </div>
                            )}
                            {e.choice === "paid" && e.canUndo && !e.notInStatement && (
                                <button type="button" className="sg-linkbtn" disabled={busy === e.id}
                                        style={{ flexBasis: "100%", textAlign: "left", marginTop: 4 }}
                                        onClick={() => confirm(e, false, "undo-paid")}>
                                    Didn't actually pay? Undo
                                </button>
                            )}
                            {e.choice === "pending" && (
                                <div className="sg-row" style={{ flexBasis: "100%", marginTop: 8 }}>
                                    <span className="sg-sub" style={{ flex: 1 }}>Did this payment go through?</span>
                                    <button type="button" className="sg-btn sg-btn-sm sg-btn-primary" disabled={busy === e.id}
                                            onClick={() => confirm(e, true)}>I paid</button>
                                    <button type="button" className="sg-btn sg-btn-sm" disabled={busy === e.id}
                                            onClick={() => confirm(e, false)}>I didn't pay</button>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
