import { useState } from "react";
import { CalendarCheck, CheckCircle2 } from "lucide-react";
import { guard, guardError } from "../../services/guardApi";
import { SOURCE_LABEL, inr } from "./format";

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/* One whole (the salary) split into four parts, read beside its figures: a thin
   segmented bar with no text, and a swatch on each row in place of a legend.
   The order is the validated one (see guardCss.js). */
export function PlanView({ plan }) {
    const goals = sum(plan.goals.map((g) => g.amount));
    const spending = sum(plan.weekly);
    const parts = [
        { key: "bills", name: "Rent and bills", amount: plan.bills, color: "var(--sg-seg-bills)" },
        { key: "goals", name: "Savings goals", amount: goals, color: "var(--sg-seg-goals)" },
        { key: "spending", name: "Spending, four weeks", amount: spending, color: "var(--sg-seg-spending)" },
        { key: "buffer", name: "Buffer for top-ups", amount: plan.buffer, color: "var(--sg-seg-buffer)" },
    ];
    const total = plan.salary || sum(parts.map((p) => p.amount));
    const pct = (n) => `${Math.round((n * 100) / total)}%`;

    return (
        <>
            <div className="sg-split" role="img"
                 aria-label={`Salary ${inr(total)}: ${parts.map((p) => `${p.name} ${inr(p.amount)}`).join(", ")}`}>
                {parts.filter((p) => p.amount > 0).map((p) => (
                    <div key={p.key} title={`${p.name}: ${inr(p.amount)} (${pct(p.amount)})`}
                         style={{ flex: `${p.amount} 0 0`, background: p.color }} />
                ))}
            </div>
            <ul className="sg-list">
                {parts.map((p) => (
                    <li key={p.key} style={{ alignItems: "flex-start" }}>
                        <span className="sg-swatch" style={{ background: p.color, marginTop: 4 }} aria-hidden />
                        <div className="sg-list-main">
                            <div className="sg-list-title">{p.name}</div>
                            {p.key === "goals" && plan.goals.length > 0 && (
                                <div className="sg-list-sub">
                                    {plan.goals.map((g) => `${g.goal} ${inr(g.amount)}`).join(" · ")}
                                </div>
                            )}
                            {p.key === "spending" && (
                                <div className="sg-list-sub">
                                    {plan.weekly.map((w, i) => `Week ${i + 1} ${inr(w)}`).join(" · ")}
                                </div>
                            )}
                            {p.key === "buffer" && <div className="sg-list-sub">Stays in your main account</div>}
                        </div>
                        <div className="sg-list-value">{inr(p.amount)}</div>
                    </li>
                ))}
            </ul>
        </>
    );
}

export default function PaydayPanel({ wallet, onWallet }) {
    const [salary, setSalary] = useState(wallet.plan?.salary ? String(wallet.plan.salary) : "");
    const [proposal, setProposal] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [approved, setApproved] = useState(false);

    async function plan(e) {
        e.preventDefault();
        setBusy(true);
        setError("");
        setApproved(false);
        try {
            setProposal(await guard("payday", { salary: Number(salary) }));
        } catch (err) {
            setError(guardError(err));
        } finally {
            setBusy(false);
        }
    }

    async function approve() {
        setBusy(true);
        setError("");
        try {
            const r = await guard("approve-plan", { planId: proposal.planId });
            onWallet(r.wallet);
            setApproved(true);
        } catch (err) {
            setError(guardError(err));
        } finally {
            setBusy(false);
        }
    }

    const active = wallet.plan;

    return (
        <div className="sg-stack">
            <form className="sg-card" onSubmit={plan}>
                <div className="sg-h2">Salary day</div>
                <p className="sg-sub" style={{ margin: "4px 0 12px" }}>
                    The Payday Planner reads your budgets and goals, then splits the salary before you can spend it.
                </p>
                {error && <div className="sg-error" role="alert">{error}</div>}
                <label className="sg-field">
                    <span className="sg-label">This month's salary</span>
                    <span className="sg-money">
                        <span>₹</span>
                        <input className="sg-input" inputMode="numeric" value={salary} aria-label="Salary in rupees"
                               onChange={(e) => setSalary(e.target.value.replace(/\D/g, ""))} />
                    </span>
                </label>
                <button type="submit" className="sg-btn sg-btn-primary sg-btn-block" style={{ marginTop: 12 }}
                        disabled={busy || !(Number(salary) > 0)}>
                    <CalendarCheck size={16} /> {busy && !proposal ? "Planning your month…" : "Plan my month"}
                </button>
            </form>

            {proposal && (
                <div className="sg-card">
                    <div className="sg-payee">
                        <div className="sg-h2">The plan for {inr(proposal.plan.salary)}</div>
                        <span className="sg-chip">{SOURCE_LABEL[proposal.plan.source] || proposal.plan.source}</span>
                    </div>
                    <PlanView plan={proposal.plan} />
                    <p className="sg-p" style={{ margin: "12px 0" }}>{proposal.plan.message}</p>
                    {approved ? (
                        <span className="sg-chip sg-chip-good" role="status">
                            <CheckCircle2 size={13} aria-hidden /> Approved: week 1 has moved to your spending account
                        </span>
                    ) : (
                        <div className="sg-row">
                            <button type="button" className="sg-btn sg-btn-primary" onClick={approve} disabled={busy}>
                                Approve this plan
                            </button>
                            <button type="button" className="sg-btn sg-btn-quiet" onClick={plan} disabled={busy}>
                                Plan again
                            </button>
                        </div>
                    )}
                </div>
            )}

            {active && !proposal && (
                <div className="sg-card">
                    <div className="sg-payee">
                        <div className="sg-h2">This month's plan</div>
                        <span className="sg-chip sg-chip-good"><CheckCircle2 size={13} aria-hidden /> In use</span>
                    </div>
                    <PlanView plan={active} />
                    <p className="sg-note" style={{ marginTop: 10 }}>Week {active.week + 1} of 4.</p>
                </div>
            )}
        </div>
    );
}
