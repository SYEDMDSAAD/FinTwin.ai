import { useEffect, useRef, useState } from "react";
import { Scale, Check } from "lucide-react";
import { guard, guardError } from "../../services/guardApi";
import { inr, SOURCE_LABEL } from "./format";

/* After an overspend or a top-up: the Budget Rebalancer suggests where the
   money comes from, and nothing changes until the user approves. Goal
   savings are protected unless the user lets them give. With autoSuggest
   the suggestion is ready as soon as the card shows. */

const KIND_LABEL = {
    goal: "Savings goal, this month",
    next_allowance: "Moves less next week",
    next_month: "Spread over next month's everyday budgets",
    category: "Budget, this month",
};

export default function CutsCard({ eventId, amount, reason, onWallet, autoSuggest = false }) {
    const [proposal, setProposal] = useState(null);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState("");
    const [allowGoals, setAllowGoals] = useState(false);
    const asked = useRef(false);

    async function suggest(goals = allowGoals) {
        setBusy(true);
        setError("");
        try {
            setProposal(await guard("rebalance", { eventId, allowGoals: goals }));
        } catch (e) {
            setError(guardError(e));
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        if (!autoSuggest || asked.current) return;
        asked.current = true;
        suggest(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoSuggest]);

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
                <p className="sg-p" style={{ marginTop: 10 }}>Your budgets are updated, and your goals weren't touched{allowGoals ? " beyond what you allowed" : ""}.</p>
            </div>
        );
    }

    return (
        <div className="sg-card">
            <div className="sg-payee">
                <div>
                    <div className="sg-h2">Keep this month on track</div>
                    <p className="sg-sub" style={{ marginTop: 4 }}>
                        {reason} {inr(amount)} has to come from somewhere else. Your goal savings stay protected.
                    </p>
                </div>
                <Scale size={20} color="var(--sg-accent)" aria-hidden />
            </div>
            {error && <div className="sg-error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
            {!proposal ? (
                <button type="button" className="sg-btn sg-btn-block" style={{ marginTop: 12 }} onClick={() => suggest()} disabled={busy}>
                    {busy ? "Working it out…" : "Suggest where it comes from"}
                </button>
            ) : (
                <>
                    <ul className="sg-list" style={{ marginTop: 10 }}>
                        {proposal.cuts.map((c) => (
                            <li key={`${c.kind}:${c.name}`}>
                                <div className="sg-list-main">
                                    <div className="sg-list-title">{c.name}</div>
                                    <div className="sg-list-sub">{KIND_LABEL[c.kind] || KIND_LABEL.category}</div>
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
                        <button type="button" className="sg-btn sg-btn-quiet" onClick={() => suggest()} disabled={busy}>
                            Suggest again
                        </button>
                    </div>
                    <label className="sg-sub" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                        <input type="checkbox" checked={allowGoals} disabled={busy}
                               onChange={(e) => { setAllowGoals(e.target.checked); suggest(e.target.checked); }} />
                        Let goal savings give too (slows your goals)
                    </label>
                    <div className="sg-chips" style={{ marginTop: 10 }}>
                        <span className="sg-chip">{SOURCE_LABEL[proposal.source] || proposal.source}</span>
                    </div>
                </>
            )}
        </div>
    );
}
