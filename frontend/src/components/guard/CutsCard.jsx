import { useState } from "react";
import { Scale, Check } from "lucide-react";
import { guard, guardError } from "../../services/guardApi";
import { inr, SOURCE_LABEL } from "./format";

/* After an overspend or a top-up: the Budget Rebalancer suggests where the
   money comes from this month, and nothing changes until the user approves. */
export default function CutsCard({ eventId, amount, reason, onWallet }) {
    const [proposal, setProposal] = useState(null);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState("");

    async function suggest() {
        setBusy(true);
        setError("");
        try {
            setProposal(await guard("rebalance", { eventId }));
        } catch (e) {
            setError(guardError(e));
        } finally {
            setBusy(false);
        }
    }

    async function approve() {
        setBusy(true);
        setError("");
        try {
            const r = await guard("approve-cuts", { eventId });
            setDone(true);
            onWallet?.(r.wallet);
        } catch (e) {
            setError(guardError(e));
        } finally {
            setBusy(false);
        }
    }

    if (done) {
        return (
            <div className="sg-card" role="status">
                <span className="sg-chip sg-chip-good"><Check size={13} /> Balanced</span>
                <p className="sg-p" style={{ marginTop: 10 }}>This month's plan is updated. Your FinTwin budgets aren't changed.</p>
            </div>
        );
    }

    return (
        <div className="sg-card">
            <div className="sg-payee">
                <div>
                    <div className="sg-h2">Keep this month on track</div>
                    <p className="sg-sub" style={{ marginTop: 4 }}>
                        {reason} {inr(amount)} has to come from somewhere else this month.
                    </p>
                </div>
                <Scale size={20} color="var(--sg-accent)" aria-hidden />
            </div>
            {error && <div className="sg-error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
            {!proposal ? (
                <button type="button" className="sg-btn sg-btn-block" style={{ marginTop: 12 }} onClick={suggest} disabled={busy}>
                    {busy ? "Working it out…" : "Suggest where it comes from"}
                </button>
            ) : (
                <>
                    <ul className="sg-list" style={{ marginTop: 10 }}>
                        {proposal.cuts.map((c) => (
                            <li key={`${c.kind}:${c.name}`}>
                                <div className="sg-list-main">
                                    <div className="sg-list-title">{c.name}</div>
                                    <div className="sg-list-sub">
                                        {c.kind === "goal" ? "Savings goal, this month" : c.kind === "next_allowance" ? "Moves less next week" : "Budget, this month"}
                                    </div>
                                </div>
                                <div className="sg-list-value">-{inr(c.amount)}</div>
                            </li>
                        ))}
                    </ul>
                    <p className="sg-p" style={{ margin: "10px 0 12px" }}>{proposal.message}</p>
                    <div className="sg-row">
                        <button type="button" className="sg-btn sg-btn-primary" onClick={approve} disabled={busy}>
                            Approve
                        </button>
                        <button type="button" className="sg-btn sg-btn-quiet" onClick={suggest} disabled={busy}>
                            Suggest again
                        </button>
                    </div>
                    <div className="sg-chips" style={{ marginTop: 10 }}>
                        <span className="sg-chip">{SOURCE_LABEL[proposal.source] || proposal.source}</span>
                    </div>
                </>
            )}
        </div>
    );
}
