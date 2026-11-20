import { useState } from "react";
import { guard, guardError } from "../services/guardApi";
import { storedUserIsDemo } from "../utils/demoGuard";

const PREFIX = "GUARD:";

/** Is this a payment Spend Guard recorded (and no statement has taken over yet)? */
export function isSpendGuardTx(t) {
    return typeof t?.source === "string" && t.source.startsWith("SPEND_GUARD");
}

/**
 * Under a transaction Spend Guard recorded: says it isn't confirmed by a bank
 * statement yet, and, when a statement came in without it, asks whether the
 * user paid. "I paid" keeps it; "I didn't pay" removes it and gives the money
 * back to Spend Guard's spending account.
 */
export default function SpendGuardTxTag({ t, onChanged }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    if (!isSpendGuardTx(t)) return null;
    const eventId = (t.externalId || "").startsWith(PREFIX) ? t.externalId.slice(PREFIX.length) : null;
    const unmatched = t.source === "SPEND_GUARD_UNMATCHED";
    const demo = storedUserIsDemo();

    async function answer(paid) {
        setBusy(true);
        setError("");
        try {
            await guard(paid ? "keep-paid" : "undo-paid", paid ? { eventId } : { eventId, why: "not_in_statement" });
            onChanged?.();
        } catch (e) {
            setError(guardError(e));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="sgt">
            <style>{CSS}</style>
            <span className={`sgt-chip${unmatched ? " sgt-warn" : ""}`}>
                {unmatched ? "Spend Guard · not in your statement"
                    : t.source === "SPEND_GUARD_KEPT" ? "Spend Guard · you said you paid"
                    : "Spend Guard · not yet in a statement"}
            </span>
            {unmatched && (demo || !eventId ? (
                <span className="sgt-note">Spend Guard asks about this in its scan history.</span>
            ) : (
                <span className="sgt-ask">
                    Did you pay?
                    <button type="button" disabled={busy} onClick={() => answer(true)}>I paid</button>
                    <button type="button" disabled={busy} onClick={() => answer(false)}>I didn't pay</button>
                </span>
            ))}
            {error && <span className="sgt-error" role="alert">{error}</span>}
        </div>
    );
}

const CSS = `
  .sgt { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 4px; }
  .sgt-chip { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px;
              background: rgba(74,222,128,0.12); color: #4ade80; }
  .sgt-warn { background: rgba(251,191,36,0.14); color: #fbbf24; }
  .sgt-note, .sgt-ask { font-size: 11px; color: var(--text-muted); display: inline-flex; gap: 6px; align-items: center; }
  .sgt-ask button { font: inherit; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 8px; cursor: pointer;
                    border: 1px solid var(--border-subtle, rgba(255,255,255,0.12)); background: transparent; color: var(--text-primary); }
  .sgt-error { font-size: 11px; color: #f87171; }
  :root[data-theme="light"] .sgt-chip { background: #dcfce7; color: #166534; }
  :root[data-theme="light"] .sgt-warn { background: #fef3c7; color: #92400e; }
  :root[data-theme="light"] .sgt-error { color: #b91c1c; }
`;
