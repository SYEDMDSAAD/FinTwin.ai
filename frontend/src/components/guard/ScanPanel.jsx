import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Hand, AlertTriangle, ExternalLink, Copy, RotateCcw, ShieldCheck } from "lucide-react";
import { guard, guardError } from "../../services/guardApi";
import QrScanner from "./QrScanner";
import CutsCard from "./CutsCard";
import { FAST_LANE_REASON, SAMPLES, SOURCE_LABEL, inr, inrExact, isSample, openUpi, previewQr } from "./format";

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

export default function ScanPanel({ onWallet, onNeedTopup, initial }) {
    const [qr, setQr] = useState(null);
    const [amount, setAmount] = useState("");
    const [result, setResult] = useState(null);
    const [after, setAfter] = useState(null);         // what happened once the user chose
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [wait, setWait] = useState(0);
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
    }

    async function check(code = qr, typed = amount) {
        setBusy(true);
        setError("");
        try {
            const r = await guard("check", { qr: code, amount: typed === "" ? null : typed });
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

    async function choose(choice) {
        setBusy(true);
        setError("");
        try {
            const r = await guard("outcome", { eventId: result.eventId, choice });
            setAfter({ choice, link: r.link, toRebalance: r.toRebalance || 0 });
            onWallet?.(r.wallet);
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

    // ── Step 1: get a code ───────────────────────────────────────────────────
    if (!qr) {
        return (
            <div className="sg-stack">
                <div className="sg-card">
                    <div className="sg-h2">Scan before you pay</div>
                    <p className="sg-sub" style={{ margin: "4px 0 14px" }}>
                        Spend Guard looks at the payment first. Then your own UPI app pays, as usual.
                    </p>
                    <QrScanner onCode={(code) => pickCode(code)} />
                </div>
                <div className="sg-card">
                    <div className="sg-h2">No QR code to hand?</div>
                    <p className="sg-sub" style={{ margin: "4px 0 12px" }}>Try a made-up shop. Nothing is paid.</p>
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
                        Pay {inrExact(result.amount)} in your UPI app
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
                    <div className="sg-h2">{sample ? "Sample code: nothing to pay" : "Over to your UPI app"}</div>
                    <p className="sg-sub" style={{ margin: "4px 0 12px" }}>
                        {sample
                            ? "With a real QR code, your UPI app opens here with the payee and amount filled in. You approve it there with your PIN."
                            : "Your UPI app should open with the payee and amount filled in. You approve it there with your PIN, as usual."}
                    </p>
                    {!sample && after.link && (
                        <div className="sg-row">
                            <button type="button" className="sg-btn" onClick={() => openUpi(after.link)}>
                                <ExternalLink size={15} /> Open UPI app again
                            </button>
                            <button type="button" className="sg-btn sg-btn-quiet"
                                    onClick={() => navigator.clipboard?.writeText(after.link)}>
                                <Copy size={15} /> Copy payment link
                            </button>
                        </div>
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
