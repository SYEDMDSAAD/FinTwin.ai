import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Hand, AlertTriangle, Copy, RotateCcw, ShieldCheck } from "lucide-react";
import { guard, guardError } from "../../services/guardApi";
import QrScanner from "./QrScanner";
import CutsCard from "./CutsCard";
import UpiAppChoice from "./UpiAppChoice";
import { FAST_LANE_REASON, SAMPLES, SOURCE_LABEL, inr, inrExact, isPhone, isSample, openUpi, previewQr, upiLinkFor } from "./format";

// A pause asks for five seconds before "Pay anyway" works: long enough to
// think, short enough never to trap anyone. Skip and Wishlist work at once.
export const PAUSE_SECONDS = 5;

const DECISION = {
    go: { cls: "sg-chip-good", Icon: CheckCircle2, label: "Looks fine" },
    pause: { cls: "sg-chip-warn", Icon: Hand, label: "Pause" },
    insufficient: { cls: "sg-chip-crit", Icon: AlertTriangle, label: "Not enough money" },
};

function Facts({ result }) {
    const chips = [];
    const b = result.budget;
    if (b) {
        chips.push(b.over_after
            ? `${result.category} budget ${inr(-b.left_after)} over`
            : `${inr(b.left_after)} left in ${result.category}`);
    }
    if (result.week) chips.push(`${inr(result.week.left_after)} left this week`);
    if (result.goal && result.decision === "pause") {
        chips.push(`${result.goal.name}: about ${result.goal.delay_days} day${result.goal.delay_days === 1 ? "" : "s"} later`);
    }
    return <div className="sg-chips">{chips.map((c) => <span key={c} className="sg-chip">{c}</span>)}</div>;
}

export default function ScanPanel({ onWallet, onNeedTopup, initial, onFinTwinChanged }) {
    const [qr, setQr] = useState(null);
    const [amount, setAmount] = useState("");
    const [result, setResult] = useState(null);
    const [after, setAfter] = useState(null);         // what happened once the user chose
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [wait, setWait] = useState(0);
    const [typedId, setTypedId] = useState("");
    const [typedName, setTypedName] = useState("");
    const [typedError, setTypedError] = useState("");
    const [purpose, setPurpose] = useState("");      // what an unknown payment is for
    const [note, setNote] = useState("");
    const handled = useRef(null);

    const preview = qr ? previewQr(qr) : null;
    const sample = qr ? isSample(qr) : false;

    function reset() {
        setQr(null);
        setAmount("");
        setResult(null);
        setAfter(null);
        setError("");
        setWait(0);
        setPurpose("");
        setNote("");
    }

    async function check(code = qr, typed = amount, why = null) {
        setBusy(true);
        setError("");
        try {
            const r = await guard("check", { qr: code, amount: typed === "" ? null : typed,
                                             ...(why ? { purpose: why.purpose, reason: why.note.trim() } : {}) });
            setResult(r);
            setWait(r.decision === "pause" ? PAUSE_SECONDS : 0);
        } catch (e) {
            setError(guardError(e));
        } finally {
            setBusy(false);
        }
    }

    // A wishlist item being bought arrives here and goes through a normal check
    useEffect(() => {
        if (!initial || handled.current === initial) return;
        handled.current = initial;
        reset();
        setQr(initial.qr);
        setAmount(initial.amount ? String(Number(initial.amount)) : "");
        check(initial.qr, initial.amount ?? "");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initial]);

    useEffect(() => {
        if (wait <= 0) return undefined;
        const t = setTimeout(() => setWait((w) => w - 1), 1000);
        return () => clearTimeout(t);
    }, [wait]);

    async function didNotPay() {
        setBusy(true);
        setError("");
        try {
            const r = await guard("unrecord", { eventId: result.eventId });
            setAfter((a) => ({ ...a, recorded: r.removed ? "removed" : a.recorded }));
            if (r.removed) onFinTwinChanged?.();
        } catch (e) {
            setError(guardError(e));
        } finally {
            setBusy(false);
        }
    }

    async function choose(choice) {
        setBusy(true);
        setError("");
        try {
            const r = await guard("outcome", { eventId: result.eventId, choice });
            setAfter({ choice, link: r.link, toRebalance: r.toRebalance || 0,
                       recorded: r.recordedTransactionId ? "yes" : null });
            onWallet?.(r.wallet);
            if (r.recordedTransactionId) onFinTwinChanged?.();
            if (choice === "paid" && r.link && !sample) openUpi(r.link);
        } catch (e) {
            setError(guardError(e));
        } finally {
            setBusy(false);
        }
    }

    function pickCode(code, sampleAmount) {
        reset();
        setQr(code);
        if (sampleAmount) setAmount(String(sampleAmount));
    }

    function typedPayee(e) {
        e.preventDefault();
        const link = upiLinkFor(typedId, typedName);
        if (!link) {
            setTypedError("Enter a UPI ID like name@okhdfcbank or 9876543210@ybl.");
            return;
        }
        setTypedError("");
        pickCode(link);
    }

    // ── Step 1: get a code ───────────────────────────────────────────────────
    if (!qr) {
        return (
            <div className="sg-stack">
                <div className="sg-card">
                    <div className="sg-h2">Scan before you pay</div>
                    <p className="sg-sub" style={{ margin: "4px 0 14px" }}>
                        Spend Guard looks at the payment first. Then Google Pay pays, as usual.
                    </p>
                    <QrScanner onCode={(code) => pickCode(code)} />
                </div>
                <div className="sg-card">
                    <div className="sg-h2">No QR code to hand?</div>
                    <p className="sg-sub" style={{ margin: "4px 0 12px" }}>
                        Type the UPI ID you're paying. Spend Guard checks it the same way.
                    </p>
                    <form onSubmit={typedPayee} noValidate>
                        {typedError && <div className="sg-error" role="alert">{typedError}</div>}
                        <label className="sg-field">
                            <span className="sg-label">UPI ID</span>
                            <input className="sg-input" value={typedId} placeholder="name@okhdfcbank"
                                   autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email"
                                   onChange={(e) => setTypedId(e.target.value.trim())} aria-label="UPI ID" />
                        </label>
                        <label className="sg-field" style={{ marginTop: 10 }}>
                            <span className="sg-label">Name (optional)</span>
                            <input className="sg-input" value={typedName} maxLength={60} placeholder="Shop or person"
                                   onChange={(e) => setTypedName(e.target.value)} aria-label="Payee name" />
                        </label>
                        <button type="submit" className="sg-btn sg-btn-primary" style={{ marginTop: 12 }}
                                disabled={!typedId}>
                            Continue
                        </button>
                    </form>
                    <p className="sg-sub" style={{ margin: "16px 0 10px" }}>Or try a made-up shop. Nothing is paid.</p>
                    <div className="sg-row">
                        {SAMPLES.map((s) => (
                            <button key={s.label} type="button" className="sg-btn sg-btn-sm" onClick={() => pickCode(s.qr, s.amount)}>
                                {s.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // ── Step 2: confirm the payee and amount ─────────────────────────────────
    if (!result) {
        const fixed = preview?.am;
        return (
            <form className="sg-card" onSubmit={(e) => { e.preventDefault(); check(); }}>
                {error && <div className="sg-error" role="alert">{error}</div>}
                <div className="sg-payee">
                    <div style={{ minWidth: 0 }}>
                        <div className="sg-payee-name">{preview?.pn || "UPI payee"}</div>
                        <div className="sg-payee-upi">{preview?.pa || qr}</div>
                    </div>
                    {fixed != null && <div className="sg-amount">{inrExact(fixed)}</div>}
                </div>
                {fixed == null && (
                    <label className="sg-field" style={{ marginTop: 14 }}>
                        <span className="sg-label">Amount</span>
                        <span className="sg-money">
                            <span>₹</span>
                            <input className="sg-input" inputMode="decimal" value={amount} autoFocus
                                   onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Amount in rupees" />
                        </span>
                    </label>
                )}
                <div className="sg-row" style={{ marginTop: 14 }}>
                    <button type="submit" className="sg-btn sg-btn-primary" disabled={busy || (fixed == null && !(Number(amount) > 0))}>
                        <ShieldCheck size={16} /> {busy ? "Checking…" : "Check before paying"}
                    </button>
                    <button type="button" className="sg-btn sg-btn-quiet" onClick={reset} disabled={busy}>Scan a different code</button>
                </div>
            </form>
        );
    }

    // ── Step 2b: Spend Guard can't tell who this is, so it asks what it's for ─
    if (result.decision === "ask_reason") {
        return (
            <form className="sg-card" onSubmit={(e) => { e.preventDefault(); check(qr, amount, { purpose, note }); }}>
                {error && <div className="sg-error" role="alert">{error}</div>}
                <div className="sg-payee">
                    <div style={{ minWidth: 0 }}>
                        <div className="sg-payee-name">{result.payeeName || "UPI payee"}</div>
                        <div className="sg-payee-upi">{result.payeeUpi}</div>
                    </div>
                    <div className="sg-amount">{inrExact(result.amount)}</div>
                </div>
                <p className="sg-message" id="sg-reason-question">{result.question}</p>
                <div className="sg-row" role="radiogroup" aria-labelledby="sg-reason-question">
                    {(result.purposes || []).map((p) => (
                        <button key={p} type="button" role="radio" aria-checked={purpose === p}
                                className={`sg-btn sg-btn-sm${purpose === p ? " sg-btn-primary" : ""}`}
                                onClick={() => setPurpose(p)}>
                            {p}
                        </button>
                    ))}
                </div>
                <label className="sg-field" style={{ marginTop: 12 }}>
                    <span className="sg-label">In your own words (optional)</span>
                    <input className="sg-input" value={note} maxLength={120} placeholder="Splitting last night's dinner"
                           onChange={(e) => setNote(e.target.value)} aria-label="What this payment is for, in your own words" />
                </label>
                <p className="sg-sub" style={{ margin: "6px 0 0" }}>
                    Spend Guard's AI reads this to check the payment. Leave out names and numbers.
                </p>
                <div className="sg-row" style={{ marginTop: 14 }}>
                    <button type="submit" className="sg-btn sg-btn-primary" disabled={busy || !purpose}>
                        <ShieldCheck size={16} /> {busy ? "Checking…" : "Check before paying"}
                    </button>
                    <button type="button" className="sg-btn sg-btn-quiet" onClick={reset} disabled={busy}>Scan a different code</button>
                </div>
            </form>
        );
    }

    // ── Step 3: the decision, then what the user chose ───────────────────────
    const d = DECISION[result.decision] || DECISION.go;
    const sourceText = result.source === "fast_lane"
        ? FAST_LANE_REASON[result.reason] || SOURCE_LABEL.fast_lane
        : SOURCE_LABEL[result.source] || result.source;

    return (
        <div className="sg-stack">
            <div className={`sg-card sg-decision sg-decision-${result.decision}`}>
                <div className="sg-payee">
                    <div style={{ minWidth: 0 }}>
                        <span className={`sg-chip ${d.cls}`}><d.Icon size={13} aria-hidden /> {d.label}</span>
                        <div className="sg-payee-name" style={{ marginTop: 10 }}>{result.payeeName || "UPI payee"}</div>
                        <div className="sg-payee-upi">{result.payeeUpi} · {result.category}</div>
                    </div>
                    <div className="sg-amount">{inrExact(result.amount)}</div>
                </div>

                {result.message && <p className="sg-message">{result.message}</p>}
                {result.decision === "pause" && !after && (
                    <div className="sg-breath" aria-hidden><div /></div>
                )}
                <Facts result={result} />
                {error && <div className="sg-error" role="alert" style={{ marginTop: 12 }}>{error}</div>}

                {!after && result.decision === "go" && (
                    <button type="button" className="sg-btn sg-btn-primary sg-btn-block" style={{ marginTop: 14 }}
                            onClick={() => choose("paid")} disabled={busy}>
                        Pay {inrExact(result.amount)} in Google Pay
                    </button>
                )}
                {!after && result.decision === "pause" && (
                    <div className="sg-row" style={{ marginTop: 14 }}>
                        <button type="button" className="sg-btn sg-btn-primary" onClick={() => choose("skipped")} disabled={busy}>
                            Skip it
                        </button>
                        {result.showWishlist && (
                            <button type="button" className="sg-btn" onClick={() => choose("wishlist")} disabled={busy}>
                                Wishlist for 2 days
                            </button>
                        )}
                        <button type="button" className="sg-btn sg-btn-quiet" onClick={() => choose("paid")}
                                disabled={busy || wait > 0} aria-live="polite">
                            {wait > 0 ? `Pay anyway (${wait})` : "Pay anyway"}
                        </button>
                    </div>
                )}
                {!after && result.decision === "insufficient" && (
                    <button type="button" className="sg-btn sg-btn-primary sg-btn-block" style={{ marginTop: 14 }}
                            onClick={() => onNeedTopup?.(Math.ceil((result.rupees - result.week.left) / 100) * 100)}>
                        Ask for a top-up
                    </button>
                )}

                <div className="sg-chips" style={{ marginTop: 12 }}>
                    <span className="sg-chip">{sourceText}</span>
                </div>
            </div>

            {after?.choice === "paid" && (
                <div className="sg-card" role="status">
                    <div className="sg-h2">
                        {sample ? "Sample code: nothing to pay" : isPhone() ? "Over to Google Pay" : "Scan to pay with your phone"}
                    </div>
                    {(sample || isPhone()) && (
                        <p className="sg-sub" style={{ margin: "4px 0 12px" }}>
                            {sample
                                ? "With a real QR code, Google Pay opens here with the payee and amount filled in (on a computer, you scan a code with your phone). You approve it there with your PIN."
                                : "Google Pay should open with the payee and amount filled in. You approve it there with your PIN, as usual."}
                        </p>
                    )}
                    {!sample && after.link && (
                        <UpiAppChoice link={after.link}>
                            <button type="button" className="sg-btn sg-btn-quiet"
                                    onClick={() => navigator.clipboard?.writeText(after.link)}>
                                <Copy size={15} /> Copy payment link
                            </button>
                        </UpiAppChoice>
                    )}
                    {after.recorded === "yes" && (
                        <div className="sg-row" style={{ marginTop: 12, alignItems: "center" }}>
                            <span className="sg-sub" style={{ flex: 1 }}>
                                Added to your transactions. Your bank statement replaces it when you import it.
                            </span>
                            <button type="button" className="sg-btn sg-btn-quiet" onClick={didNotPay} disabled={busy}>
                                I didn't pay
                            </button>
                        </div>
                    )}
                    {after.recorded === "removed" && (
                        <p className="sg-sub" style={{ margin: "12px 0 0" }}>Taken out of your transactions.</p>
                    )}
                </div>
            )}
            {after?.choice === "paid" && after.toRebalance > 0 && (
                <CutsCard eventId={result.eventId} amount={after.toRebalance} onWallet={onWallet}
                          reason={`This took your ${result.category} budget over.`} />
            )}
            {after?.choice === "skipped" && (
                <div className="sg-card" role="status">
                    <div className="sg-h2">Skipped</div>
                    <p className="sg-sub" style={{ marginTop: 4 }}>{inrExact(result.amount)} stays in your spending account.</p>
                </div>
            )}
            {after?.choice === "wishlist" && (
                <div className="sg-card" role="status">
                    <div className="sg-h2">On your wishlist</div>
                    <p className="sg-sub" style={{ marginTop: 4 }}>
                        It's in the Wallet tab. In two days you can buy it or let it go.
                    </p>
                </div>
            )}

            {(after || result.decision === "insufficient") && (
                <button type="button" className="sg-btn sg-btn-quiet sg-btn-block" onClick={reset}>
                    <RotateCcw size={15} /> Scan another
                </button>
            )}
        </div>
    );
}
