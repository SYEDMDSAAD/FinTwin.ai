import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Hand, Heart, ShoppingBag, Zap } from "lucide-react";
import { guard, guardError } from "../../services/guardApi";
import CutsCard from "./CutsCard";
import { storedUserIsDemo } from "../../utils/demoGuard";
import UpiAppChoice from "./UpiAppChoice";
import { SOURCE_LABEL, hoursUntil, inr, isPhone, openUpi, shortTime } from "./format";

const LANGUAGES = ["English", "Hindi", "Hinglish", "Telugu", "Tamil", "Kannada", "Malayalam", "Marathi", "Bengali"];

const TOPUP = {
    approve: { cls: "sg-chip-good", Icon: CheckCircle2, label: "Approved" },
    emergency: { cls: "sg-chip-good", Icon: Zap, label: "Emergency top-up" },
    approve_less: { cls: "sg-chip-warn", Icon: Hand, label: "A smaller amount" },
    wait: { cls: "sg-chip-warn", Icon: Clock, label: "Worth waiting" },
    wishlist: { cls: "sg-chip-warn", Icon: ShoppingBag, label: "Can it wait?" },
};

function Balances({ wallet }) {
    const left = wallet.balances.spending;
    const share = wallet.weekly > 0 ? Math.min(1, Math.max(0, left / wallet.weekly)) : 0;
    const low = share < 0.25;
    return (
        <div className="sg-card">
            <div className="sg-hero-label">Left to spend this week</div>
            <div className="sg-hero">{inr(left)}</div>
            {/* Left over from last week rolls on, so "left" can pass the allowance: the meter's
                value stays in its range and the full figure goes in the text */}
            <div className={`sg-meter${low ? " sg-meter-low" : ""}`} role="meter" aria-label="Left to spend this week"
                 aria-valuemin={0} aria-valuemax={wallet.weekly} aria-valuenow={Math.min(wallet.weekly, Math.max(0, left))}
                 aria-valuetext={`${inr(left)} left, of a ${inr(wallet.weekly)} weekly allowance`}>
                <div style={{ width: `${share * 100}%` }} />
            </div>
            <div className="sg-payee" style={{ marginTop: 8 }}>
                <span className="sg-note">
                    Weekly allowance {inr(wallet.weekly)}
                    {left > wallet.weekly && `, plus ${inr(left - wallet.weekly)} carried over`}
                    {" "}· next one in {wallet.daysToAllowance} day{wallet.daysToAllowance === 1 ? "" : "s"}
                    {/* Says why the buffer grew after a cut to next week */}
                    {wallet.nextAllowanceCut > 0 && `, ${inr(wallet.nextAllowanceCut)} smaller (kept in your buffer)`}
                </span>
                {low && <span className="sg-chip sg-chip-warn"><AlertTriangle size={12} aria-hidden /> Running low</span>}
            </div>
            <div className="sg-tiles">
                <div className="sg-tile">
                    <div className="sg-tile-label">Buffer, free for top-ups</div>
                    <div className="sg-tile-value">{inr(wallet.buffer)}</div>
                </div>
                <div className="sg-tile">
                    <div className="sg-tile-label">Main account</div>
                    <div className="sg-tile-value">{inr(wallet.balances.main)}</div>
                </div>
                <div className="sg-tile">
                    <div className="sg-tile-label">Saved by pausing</div>
                    <div className="sg-tile-value">{inr(wallet.savedByPausing)}</div>
                </div>
            </div>
        </div>
    );
}

function Topup({ wallet, prefill, onWallet }) {
    const [amount, setAmount] = useState(prefill ? String(prefill) : "");
    const [reason, setReason] = useState("");
    const [emergency, setEmergency] = useState(false);
    const [answer, setAnswer] = useState(null);
    const [moved, setMoved] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    async function ask(e) {
        e.preventDefault();
        setBusy(true);
        setError("");
        setAnswer(null);
        setMoved(null);
        try {
            setAnswer(await guard("topup", { amount: Number(amount), reason, emergency }));
        } catch (err) {
            setError(guardError(err));
        } finally {
            setBusy(false);
        }
    }

    async function choose(choice, value) {
        setBusy(true);
        setError("");
        try {
            const r = await guard("outcome", { eventId: answer.eventId, choice, amount: value });
            setMoved({ choice, amount: value, link: r.link, needsUpiId: r.needsUpiId, toRebalance: r.toRebalance });
            onWallet?.(r.wallet);
            if (choice === "paid" && r.link) openUpi(r.link);
        } catch (err) {
            setError(guardError(err));
        } finally {
            setBusy(false);
        }
    }

    function startOver() {
        setAnswer(null);
        setMoved(null);
        setAmount("");
        setReason("");
        setEmergency(false);
    }

    const t = answer && (TOPUP[answer.decision] || TOPUP.approve);
    const offer = answer?.decision === "approve_less" ? answer.suggestedAmount : answer?.requested;
    // The user decides in the end: the full amount can always move, within the buffer
    const anyway = Boolean(answer) && ["approve_less", "wait", "wishlist"].includes(answer.decision)
        && answer.requested <= wallet.buffer;

    return (
        <div className="sg-stack">
            <form className="sg-card" onSubmit={ask}>
                <div className="sg-h2">Need more this week?</div>
                <p className="sg-sub" style={{ margin: "4px 0 12px" }}>
                    Ask for a top-up from your buffer. Bill money is never touched.
                </p>
                {error && <div className="sg-error" role="alert">{error}</div>}
                <fieldset disabled={Boolean(answer)} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                <div className="sg-row">
                    <label className="sg-field" style={{ flex: "1 1 120px" }}>
                        <span className="sg-label">Amount</span>
                        <span className="sg-money">
                            <span>₹</span>
                            <input className="sg-input" inputMode="numeric" value={amount} aria-label="Top-up amount in rupees"
                                   onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
                        </span>
                    </label>
                    <label className="sg-field" style={{ flex: "2 1 200px" }}>
                        <span className="sg-label">What's it for? (optional)</span>
                        <input className="sg-input" maxLength={120} value={reason} placeholder="A friend's birthday dinner"
                               onChange={(e) => setReason(e.target.value)} />
                    </label>
                </div>
                <label className="sg-check" style={{ marginTop: 12 }}>
                    <input type="checkbox" checked={emergency} onChange={(e) => setEmergency(e.target.checked)} />
                    It's an emergency: skip the questions (up to {inr(wallet.settings.emergencyMax)}, {wallet.settings.emergencyPerMonth} a month)
                </label>
                <button type="submit" className="sg-btn sg-btn-primary sg-btn-block" style={{ marginTop: 12 }}
                        disabled={busy || !(Number(amount) > 0)}>
                    {busy && !answer ? "Asking…" : "Ask for a top-up"}
                </button>
                </fieldset>
            </form>

            {answer && (
                <div className="sg-card sg-decision">
                    <span className={`sg-chip ${t.cls}`}><t.Icon size={13} aria-hidden /> {t.label}</span>
                    <p className="sg-message">{answer.message}</p>
                    {!moved && (
                        <div className="sg-row">
                            {(answer.decision === "approve" || answer.decision === "emergency" || answer.decision === "approve_less") && (
                                <button type="button" className="sg-btn sg-btn-primary" disabled={busy}
                                        onClick={() => choose("paid", offer)}>
                                    Move {inr(offer)}
                                </button>
                            )}
                            {answer.decision === "wait" && (
                                <button type="button" className="sg-btn sg-btn-primary" disabled={busy}
                                        onClick={() => choose("skipped")}>
                                    I'll wait
                                </button>
                            )}
                            {answer.decision === "wishlist" && (
                                <button type="button" className="sg-btn sg-btn-primary" disabled={busy}
                                        onClick={() => choose("wishlist")}>
                                    Add to wishlist
                                </button>
                            )}
                            {anyway && (
                                <button type="button" className="sg-btn sg-btn-quiet" disabled={busy}
                                        onClick={() => choose("paid", answer.requested)}>
                                    Move {inr(answer.requested)} anyway
                                </button>
                            )}
                            {answer.decision !== "wait" && (
                                <button type="button" className="sg-btn sg-btn-quiet" disabled={busy}
                                        onClick={() => choose("skipped")}>
                                    Not now
                                </button>
                            )}
                        </div>
                    )}
                    <div className="sg-chips" style={{ marginTop: 12 }}>
                        <span className="sg-chip">{SOURCE_LABEL[answer.source] || answer.source}</span>
                    </div>
                </div>
            )}

            {moved?.choice === "paid" && (
                <div className="sg-card" role="status">
                    <div className="sg-h2">{inr(moved.amount)} moved to your spending account</div>
                    <p className="sg-sub" style={{ marginTop: 4 }}>
                        {moved.needsUpiId
                            ? "In the demo the balances move here. Add your spending account's UPI ID in Settings, and next time Google Pay opens to move it for real."
                            : isPhone()
                                ? "Google Pay should open to pay your own spending account. You approve it there with your PIN."
                                : "Scan the code below with your phone to pay your own spending account. You approve it there with your PIN."}
                    </p>
                    {moved.link && <div style={{ marginTop: 12 }}><UpiAppChoice link={moved.link} /></div>}
                </div>
            )}
            {moved?.choice === "paid" && moved.toRebalance > 0 && (
                <CutsCard eventId={answer.eventId} amount={moved.toRebalance} onWallet={onWallet}
                          reason="This top-up is beyond your weekly plan." />
            )}
            {moved && moved.choice !== "paid" && (
                <div className="sg-card" role="status">
                    <div className="sg-h2">{moved.choice === "wishlist" ? "On your wishlist for 2 days" : "Nothing moved"}</div>
                </div>
            )}
            {moved && (
                <button type="button" className="sg-btn sg-btn-quiet sg-btn-block" onClick={startOver}>Ask for another top-up</button>
            )}
        </div>
    );
}

function CheckIns({ items, onAnswered }) {
    const [error, setError] = useState("");
    if (!items.length) return null;
    async function answer(id, worthIt) {
        setError("");
        try {
            await guard("regret", { eventId: id, worthIt });
            onAnswered();
        } catch (e) {
            setError(guardError(e));
        }
    }
    return (
        <div className="sg-card">
            <div className="sg-h2">Was it worth it?</div>
            <p className="sg-sub" style={{ margin: "4px 0 6px" }}>Your answers teach Spend Guard what you'd rather skip.</p>
            {error && <div className="sg-error" role="alert">{error}</div>}
            <ul className="sg-list">
                {items.map((e) => (
                    <li key={e.id}>
                        <div className="sg-list-main">
                            <div className="sg-list-title">{e.payeeName || (e.type === "topup" ? "Top-up" : e.category)}</div>
                            <div className="sg-list-sub">{inr(e.amount)} · {shortTime(e.at)}</div>
                        </div>
                        <button type="button" className="sg-btn sg-btn-sm" onClick={() => answer(e.id, true)}>
                            <Heart size={13} aria-hidden /> Yes
                        </button>
                        <button type="button" className="sg-btn sg-btn-sm sg-btn-quiet" onClick={() => answer(e.id, false)}>
                            Not really
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function Wishlist({ items, onWallet, onBuy }) {
    const [error, setError] = useState("");
    if (!items.length) return null;
    async function remove(id, outcome) {
        setError("");
        try {
            const r = await guard("wishlist-remove", { wishId: id, outcome });
            onWallet(r.wallet);
            if (outcome === "bought" && r.buy) onBuy(r.buy);
        } catch (e) {
            setError(guardError(e));
        }
    }
    return (
        <div className="sg-card">
            <div className="sg-h2">Wishlist</div>
            <p className="sg-sub" style={{ margin: "4px 0 6px" }}>Still want it after two days? Then it's probably worth it.</p>
            {error && <div className="sg-error" role="alert">{error}</div>}
            <ul className="sg-list">
                {items.map((w) => (
                    <li key={w.id}>
                        <div className="sg-list-main">
                            <div className="sg-list-title">{w.name}</div>
                            <div className="sg-list-sub">
                                {inr(w.amount)} · {w.ready ? "Ready to decide" : `Ready in ${hoursUntil(w.readyAt)}h`}
                            </div>
                        </div>
                        <button type="button" className="sg-btn sg-btn-sm sg-btn-quiet" onClick={() => remove(w.id, "dropped")}>
                            Let it go
                        </button>
                        {w.canBuy && (
                            <button type="button" className="sg-btn sg-btn-sm" onClick={() => remove(w.id, "bought")}>Buy</button>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}

// What Spend Guard said, then what the user did: a top-up's money moves, a shop's is paid
const SAID = {
    scan: { go: "Looked fine", pause: "Paused", insufficient: "Not enough money" },
    topup: { approve: "Approved", approve_less: "Offered less", wait: "Suggested waiting",
             wishlist: "Suggested the wishlist", emergency: "Emergency" },
};
const DID = {
    scan: { paid: "paid", skipped: "skipped", wishlist: "wishlisted" },
    topup: { paid: "moved", skipped: "nothing moved", wishlist: "wishlisted" },
};

function summary(e) {
    const kind = e.type === "topup" ? "topup" : "scan";
    const said = SAID[kind][e.decision] || e.decision;
    return e.choice ? `${said}, ${DID[kind][e.choice] || e.choice}` : said;
}

function Recent({ items }) {
    if (!items.length) return null;
    return (
        <details className="sg-card sg-details">
            <summary>Recent top-ups ({items.length})</summary>
            <ul className="sg-list" style={{ marginTop: 8 }}>
                {items.map((e) => (
                    <li key={e.id}>
                        <div className="sg-list-main">
                            <div className="sg-list-title">{e.payeeName || (e.type === "topup" ? "Top-up" : e.category)}</div>
                            <div className="sg-list-sub">
                                {summary(e)} · {SOURCE_LABEL[e.source] || e.source} · {shortTime(e.at)}
                            </div>
                        </div>
                        <div className="sg-list-value">{inr(e.amount)}</div>
                    </li>
                ))}
            </ul>
        </details>
    );
}

function Settings({ wallet, onWallet }) {
    const s = wallet.settings;
    const [language, setLanguage] = useState(s.language);
    const [minCheck, setMinCheck] = useState(String(s.minCheck));
    const [ownUpiId, setOwnUpiId] = useState("");
    const [ownName, setOwnName] = useState(s.ownName || "");
    const [confirmReset, setConfirmReset] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    async function save(e) {
        e.preventDefault();
        setError("");
        setMessage("");
        try {
            const body = { language, minCheck: Number(minCheck) || 0, ownName };
            if (ownUpiId.trim()) body.ownUpiId = ownUpiId.trim();
            onWallet(await guard("settings", body));
            setOwnUpiId("");
            setMessage("Saved.");
        } catch (err) {
            setError(guardError(err));
        }
    }

    async function reset() {
        setError("");
        try {
            onWallet(await guard("demo-reset"));
            setConfirmReset(false);
            setMessage("The demo has started again.");
        } catch (err) {
            setError(guardError(err));
        }
    }

    return (
        <details className="sg-card sg-details">
            <summary>Settings</summary>
            <form className="sg-stack" style={{ marginTop: 12 }} onSubmit={save}>
                {error && <div className="sg-error" role="alert">{error}</div>}
                <label className="sg-field">
                    <span className="sg-label">Language for Spend Guard's messages</span>
                    <select className="sg-input" value={language} onChange={(e) => setLanguage(e.target.value)}>
                        {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
                    </select>
                </label>
                <label className="sg-field">
                    <span className="sg-label">Payments below this go straight through</span>
                    <span className="sg-money">
                        <span>₹</span>
                        <input className="sg-input" inputMode="numeric" value={minCheck}
                               onChange={(e) => setMinCheck(e.target.value.replace(/\D/g, ""))} />
                    </span>
                </label>
                {!storedUserIsDemo() && <>
                <label className="sg-field">
                    <span className="sg-label">
                        Your spending account's UPI ID{s.ownUpiId ? ` (now ${s.ownUpiId})` : ""}
                    </span>
                    <input className="sg-input" value={ownUpiId} placeholder="yourname@bank" autoComplete="off"
                           spellCheck={false} onChange={(e) => setOwnUpiId(e.target.value)} />
                    <span className="sg-note">Only used to fill in top-ups to yourself. The AI never sees it.</span>
                </label>
                <label className="sg-field">
                    <span className="sg-label">Name on that account</span>
                    <input className="sg-input" maxLength={40} value={ownName} onChange={(e) => setOwnName(e.target.value)} />
                </label>
                </>}
                <div className="sg-row">
                    <button type="submit" className="sg-btn sg-btn-primary">Save settings</button>
                    {!confirmReset ? (
                        <button type="button" className="sg-btn sg-btn-quiet" onClick={() => setConfirmReset(true)}>
                            Reset the demo
                        </button>
                    ) : (
                        <button type="button" className="sg-btn" onClick={reset}>Yes, start the demo again</button>
                    )}
                </div>
                {message && <p className="sg-note" role="status">{message}</p>}
            </form>
        </details>
    );
}

export default function WalletPanel({ wallet, onWallet, onBuy, topupPrefill }) {
    async function refresh() {
        try {
            onWallet(await guard("wallet"));
        } catch {
            /* the next action will say what's wrong */
        }
    }
    return (
        <div className="sg-stack">
            <Balances wallet={wallet} />
            {/* Keyed on the prefill: a new shortfall from the scanner starts a fresh form */}
            <Topup key={topupPrefill ?? "none"} wallet={wallet} prefill={topupPrefill} onWallet={onWallet} />
            <CheckIns items={wallet.checkIns} onAnswered={refresh} />
            <Wishlist items={wallet.wishlist} onWallet={onWallet} onBuy={onBuy} />
            <Recent items={(wallet.recent || []).filter((e) => e.type !== "scan")} />
            <Settings wallet={wallet} onWallet={onWallet} />
        </div>
    );
}
