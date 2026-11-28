import { useEffect, useState } from "react";
import { CalendarCheck, CheckCircle2 } from "lucide-react";
import { guard, guardError } from "../../services/guardApi";
import API from "../../services/api";
import { SOURCE_LABEL, inr } from "./format";

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/* One whole (the salary) split into four parts, read beside its figures: a thin
   segmented bar with no text, and a swatch on each row in place of a legend.
   The order is the validated one (see guardCss.js). */
export function PlanView({ plan }) {
    const goals = sum(plan.goals.map((g) => g.amount));
    const spending = sum(plan.weekly);
    const parts = [
        { key: "bills", name: plan.sips ? `Rent, bills and SIPs (${inr(plan.sips)})` : "Rent and bills", amount: plan.bills, color: "var(--sg-seg-bills)" },
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

/* The user's own split of a proposed plan: every part editable, with what's
   left to place shown live. The guard service checks it the same way as the
   agent's plan, so nothing here is trusted. */
function PlanEditor({ plan, busy, onSave, onCancel }) {
    const [goals, setGoals] = useState(plan.goals.map((g) => ({ goal: g.goal, amount: String(g.amount) })));
    const [buffer, setBuffer] = useState(String(plan.buffer));
    const [weekly, setWeekly] = useState(plan.weekly.map(String));
    const num = (v) => Number(v) || 0;
    const placed = plan.bills + sum(goals.map((g) => num(g.amount))) + num(buffer) + sum(weekly.map(num));
    const left = plan.salary - placed;
    const digits = (v) => v.replace(/\D/g, "").slice(0, 8);
    const field = (label, value, set) => (
        <label className="sg-field" key={label}>
            <span className="sg-label">{label}</span>
            <span className="sg-money">
                <span>₹</span>
                <input className="sg-input" inputMode="numeric" value={value} aria-label={`${label} in rupees`}
                       onChange={(e) => set(digits(e.target.value))} />
            </span>
        </label>
    );

    return (
        <form onSubmit={(e) => {
            e.preventDefault();
            onSave({ goals: goals.map((g) => ({ goal: g.goal, amount: num(g.amount) })),
                     buffer: num(buffer), weekly: weekly.map(num) });
        }}>
            <p className="sg-sub" style={{ margin: "4px 0 12px" }}>
                {plan.sips ? "Rent, bills and SIPs" : "Rent and bills"} stay at {inr(plan.bills)}. Split the rest your way; every week needs enough for essentials.
            </p>
            <div className="sg-plan-grid">
                {goals.map((g, i) => field(g.goal, g.amount,
                    (v) => setGoals((gs) => gs.map((x, j) => (j === i ? { ...x, amount: v } : x)))))}
                {field("Buffer for top-ups", buffer, setBuffer)}
                {weekly.map((w, i) => field(`Week ${i + 1} spending`, w,
                    (v) => setWeekly((ws) => ws.map((x, j) => (j === i ? v : x)))))}
            </div>
            <p className={`sg-chip ${left === 0 ? "sg-chip-good" : "sg-chip-warn"}`} role="status" style={{ marginTop: 12 }}>
                {left === 0 ? `Adds up to ${inr(plan.salary)}` : left > 0 ? `${inr(left)} left to place` : `${inr(-left)} over the salary`}
            </p>
            <div className="sg-row" style={{ marginTop: 12 }}>
                <button type="submit" className="sg-btn sg-btn-primary" disabled={busy || left !== 0}>Use my plan</button>
                <button type="button" className="sg-btn sg-btn-quiet" onClick={onCancel} disabled={busy}>Cancel</button>
            </div>
        </form>
    );
}

/** A salary that landed in the last 10 days with no plan approved since. */
export function salaryNeedsPlan(salary, plan, now = new Date()) {
    const paid = new Date(salary.lastPaid + "T00:00:00");
    if (now - paid > 10 * 86_400_000) return false;
    return !plan?.approved_at || new Date(plan.approved_at) < paid;
}

function shortDate(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function PaydayPanel({ wallet, onWallet, onFinTwinChanged }) {
    const [salary, setSalary] = useState(wallet.plan?.salary ? String(wallet.plan.salary) : "");
    const [proposal, setProposal] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [approved, setApproved] = useState(false);
    const [earmarked, setEarmarked] = useState(0);
    const [editing, setEditing] = useState(false);
    const [arrived, setArrived] = useState(null);

    // The salary FinTwin saw land (from bank SMS, alerts or statements) fills
    // the amount in, unless a plan was already approved since it arrived
    useEffect(() => {
        let live = true;
        API.get("/plan/draft").then(({ data }) => {
            const s = data?.salary;
            if (!live || !s?.lastPaid || !(s.lastAmount > 0)) return;
            if (!salaryNeedsPlan(s, wallet.plan)) return;
            setArrived(s);
            setSalary((typed) => typed || String(Math.round(s.lastAmount)));
        }).catch(() => {});
        return () => { live = false; };
    }, [wallet.plan]);

    async function saveOwn(split) {
        setBusy(true);
        setError("");
        try {
            setProposal(await guard("edit-plan", { planId: proposal.planId, ...split }));
            setEditing(false);
        } catch (err) {
            setError(guardError(err));
        } finally {
            setBusy(false);
        }
    }

    async function plan(e) {
        e.preventDefault();
        setBusy(true);
        setError("");
        setApproved(false);
        setEarmarked(0);
        setEditing(false);
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
            setEarmarked(r.goalsEarmarked || 0);
            if (r.goalsEarmarked > 0) onFinTwinChanged?.();
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
                {arrived && (
                    <p className="sg-chip sg-chip-good" role="status" style={{ marginBottom: 12 }}>
                        Your salary of {inr(Math.round(arrived.lastAmount))} arrived on {shortDate(arrived.lastPaid)}
                    </p>
                )}
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
                    {editing ? (
                        <PlanEditor plan={proposal.plan} busy={busy} onSave={saveOwn} onCancel={() => setEditing(false)} />
                    ) : (
                        <>
                            <PlanView plan={proposal.plan} />
                            <p className="sg-p" style={{ margin: "12px 0" }}>{proposal.plan.message}</p>
                        </>
                    )}
                    {editing ? null : approved ? (
                        <div role="status">
                            <span className="sg-chip sg-chip-good">
                                <CheckCircle2 size={13} aria-hidden /> Approved: week 1 has moved to your spending account
                            </span>
                            {earmarked > 0 && (
                                <p className="sg-sub" style={{ margin: "8px 0 0" }}>
                                    The goal money is set aside in Goals Planner for this month. It counts as
                                    you actually save it.
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="sg-row">
                            <button type="button" className="sg-btn sg-btn-primary" onClick={approve} disabled={busy}>
                                Approve this plan
                            </button>
                            <button type="button" className="sg-btn" onClick={() => setEditing(true)} disabled={busy}>
                                Set it yourself
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
