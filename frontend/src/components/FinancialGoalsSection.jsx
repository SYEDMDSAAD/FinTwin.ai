import { useState, useMemo, useEffect } from "react";
import { sipApi } from "../services/trackedHoldings";
import { parseGoalText } from "../utils/goalText";
import { toast } from "react-hot-toast";
import { Target, Pencil, Trash2, RefreshCw, Link, Trophy, ChevronDown, Plus, Check } from "lucide-react";
import AIPlanCard from "./AIPlanCard";
import { Button, Badge, Progress, SectionHeader, EmptyState, cx } from "./ui";


// Starting points for the create form — one tap fills title/amount/duration,
// which is the slowest part of creating a goal from scratch.
const GOAL_PRESETS = [
  { label: "Emergency Fund", amount: 300000, months: 12 },
  { label: "Dream Vacation", amount: 150000, months: 10 },
  { label: "New Car", amount: 800000, months: 36 },
  { label: "Home Down Payment", amount: 2000000, months: 60 },
];

function capitalizeFirst(s) {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

// createdAt + durationMonths gives the deadline the AI plan is written against;
// showing it turns an abstract "24m" into a date the user can actually plan for.
function deadline(goal) {
  if (!goal.createdAt || !goal.durationMonths) return null;
  const start = new Date(goal.createdAt);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setMonth(end.getMonth() + goal.durationMonths);
  const now = new Date();
  const monthsLeft = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
  return {
    monthsLeft,
    label: end.toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
  };
}

// "8 months left", "3 years left", "2 years 6 months left"
function timeLeft(due) {
  const m = due.monthsLeft;
  if (m < 0) return `overdue since ${due.label}`;
  if (m === 0) return "due this month";
  if (m < 24) return `${m} month${m === 1 ? "" : "s"} left`;
  const y = Math.floor(m / 12), r = m % 12;
  return r ? `${y} years ${r} month${r === 1 ? "" : "s"} left` : `${y} years left`;
}

const HEALTHY = ["Excellent", "On Track", "Good"];

function FinancialGoalsSection({ goals, createGoal, updateGoal, deleteGoal, regenerateGoal, completeGoal }) {

  const [title, setTitle] = useState("");

  const [targetAmount, setTargetAmount] = useState("");

  const [durationMonths, setDurationMonths] = useState("");

  const [sentence, setSentence] = useState("");

  const [loadingGoalId, setLoadingGoalId] = useState(null);

  const [completingGoalId, setCompletingGoalId] = useState(null);

  const [creatingGoal, setCreatingGoal] = useState(false);

  const [editingGoalId, setEditingGoalId] = useState(null);

  const [editTitle, setEditTitle] = useState("");

  const [editTargetAmount, setEditTargetAmount] = useState("");

  const [editDurationMonths, setEditDurationMonths] = useState("");

  // Deleting a goal throws away its AI plan and history, so it takes a
  // deliberate second click rather than firing straight off the trash icon.
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingGoalId, setDeletingGoalId] = useState(null);

  // goalId -> the SIP (stored in the account) that funds that goal
  const [sipLinks, setSIPLinks] = useState({});
  const [sipLinkOpen, setSIPLinkOpen] = useState(null);
  const [sipLinkForm, setSIPLinkForm] = useState({ fundName: "", monthlyAmount: "" });

  // null until the user taps it: open by default only when there's no goal yet
  const [newGoalChoice, setNewGoalOpen] = useState(null);
  const [expandedIds, setExpandedIds] = useState(new Set());

  const toggleExpanded = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    sipApi.list().then((list) => {
      if (cancelled) return;
      const byGoal = {};
      list.forEach((s) => { if (s.goalId != null) byGoal[s.goalId] = { ...s, monthlyAmount: s.amount }; });
      setSIPLinks(byGoal);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const saveSIPLink = async (goalId) => {
    const amount = parseFloat(sipLinkForm.monthlyAmount);
    if (!(amount > 0)) return;
    try {
      const sip = await sipApi.create({ fundName: sipLinkForm.fundName, amount, frequency: "Monthly", goalId });
      setSIPLinks((prev) => ({ ...prev, [goalId]: { ...sip, monthlyAmount: sip.amount } }));
      setSIPLinkOpen(null);
    } catch {
      toast.error("Couldn't link this SIP. Try again.");
    }
  };
  // Unlinking keeps the SIP in the SIP tracker; it just stops funding this goal.
  const removeSIPLink = async (goalId) => {
    const sip = sipLinks[goalId];
    if (!sip) return;
    const before = sipLinks;
    const next = { ...sipLinks };
    delete next[goalId];
    setSIPLinks(next);
    try {
      await sipApi.update(sip.id, { ...sip, goalId: null });
    } catch {
      setSIPLinks(before);
      toast.error("Couldn't remove the link.");
    }
  };

  const activeGoals = useMemo(() => (goals || []).filter(g => !g.completed), [goals]);

  const summary = useMemo(() => activeGoals.reduce((acc, g) => ({
    target: acc.target + (Number(g.targetAmount) || 0),
    saved: acc.saved + (Number(g.expectedSaved) || 0),
    monthly: acc.monthly + (Number(g.monthlyTarget) || 0),
    onTrack: acc.onTrack + (HEALTHY.includes(g.goalHealth) ? 1 : 0),
  }), { target: 0, saved: 0, monthly: 0, onTrack: 0 }), [activeGoals]);

  const canCreate = title.trim() && targetAmount && Number(targetAmount) > 0 && durationMonths && Number(durationMonths) > 0;

  // Live echo of what the goal will actually cost per month, so the user can
  // sanity-check the numbers before spending an AI generation on them.
  const previewMonthly = Number(targetAmount) > 0 && Number(durationMonths) > 0
    ? Number(targetAmount) / Number(durationMonths)
    : null;

  // "Goa trip in March, 40k" fills the three fields below; the user checks them and creates
  const fillFromSentence = (e) => {
    e.preventDefault();
    const g = parseGoalText(sentence);
    if (!g.title && !g.targetAmount && !g.durationMonths) {
      toast.error("Try something like \"Goa trip in March, 40k\".");
      return;
    }
    if (g.title) setTitle(g.title);
    if (g.targetAmount) setTargetAmount(String(g.targetAmount));
    if (g.durationMonths) setDurationMonths(String(g.durationMonths));
    setSentence("");
  };

  const applyPreset = (p) => {
    setTitle(p.label);
    setTargetAmount(String(p.amount));
    setDurationMonths(String(p.months));
  };

  const handleSubmit = async () => {

    if (!canCreate) { toast.error("Please fill all fields."); return; }
    setCreatingGoal(true);
    try {
      await createGoal({ title, targetAmount: Number(targetAmount), durationMonths: Number(durationMonths) });
      setTitle(""); setTargetAmount(""); setDurationMonths("");
    } finally { setCreatingGoal(false); }
  };

  const handleFormKeyDown = (e) => {
    if (e.key === "Enter" && canCreate && !creatingGoal) handleSubmit();
  };

  const newGoalOpen = newGoalChoice ?? activeGoals.length === 0;
  const completedGoals = (goals || []).filter(g => g.completed);
  const totalPct = summary.target > 0 ? (summary.saved / summary.target) * 100 : 0;

  const healthTone = (h) =>
    h === "Excellent" || h === "On Track" || h === "Good" ? "good" : h === "Moderate" ? "warn" : "bad";

  const startEdit = (goal) => {
    setEditingGoalId(goal.id);
    setEditTitle(goal.title);
    setEditTargetAmount(goal.targetAmount);
    setEditDurationMonths(goal.durationMonths);
  };

  return (
    <div className="max-w-2xl mb-8">
      {/* The number: what's put away towards every active goal */}
      {activeGoals.length > 0 && (
        <section aria-label="Your goals" className="px-1 mb-8">
          <p className="text-small text-ink-3">Saved towards your goals</p>
          <p className="text-hero text-ink num mt-1">{inr(summary.saved)}</p>
          <p className="mt-2 text-body text-ink-2">
            of <span className="num">{inr(summary.target)}</span> across {activeGoals.length} {activeGoals.length === 1 ? "goal" : "goals"}
            {" · "}<span className="num">{inr(summary.monthly)}</span> a month keeps them on time
          </p>
          <Progress className="mt-5" value={totalPct} label="Share of all goals saved" />
        </section>
      )}

      {/* New goal */}
      <div className="mb-6 rounded-card bg-surface border border-line">
        <button type="button" onClick={() => setNewGoalOpen(!newGoalOpen)} aria-expanded={newGoalOpen}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
          <span className="shrink-0 w-10 h-10 rounded-full bg-accent-soft text-accent flex items-center justify-center"><Plus size={18} aria-hidden /></span>
          <span className="flex-1 text-body font-medium text-ink">New goal</span>
          <ChevronDown size={18} aria-hidden className={cx("shrink-0 text-ink-3 transition-transform", newGoalOpen && "rotate-180")} />
        </button>

        {newGoalOpen && (
          <div className="px-4 pb-4 space-y-3">
            {/* Say it in a sentence */}
            <form onSubmit={fillFromSentence} className="flex gap-2">
              <input className={INPUT} placeholder={'"Goa trip in March, 40k"'} aria-label="Describe your goal"
                     value={sentence} onChange={(e) => setSentence(e.target.value)} />
              <Button type="submit" variant="secondary" disabled={!sentence.trim()} className="shrink-0">Fill in</Button>
            </form>

            <div className="flex flex-wrap gap-2">
              {GOAL_PRESETS.map(p => (
                <button key={p.label} type="button" onClick={() => applyPreset(p)}
                        className="h-8 px-3 rounded-full bg-surface-sunken text-small font-medium text-ink-2 hover:text-ink">
                  {p.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2" onKeyDown={handleFormKeyDown}>
              <input className={cx(INPUT, "col-span-2")} placeholder="Goal name" aria-label="Goal name" value={title} onChange={(e) => setTitle(capitalizeFirst(e.target.value))} />
              <input className={INPUT} type="number" inputMode="numeric" placeholder="Target ₹" aria-label="Target amount" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} />
              <input className={INPUT} type="number" inputMode="numeric" placeholder="Months" aria-label="Duration in months" value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} />
            </div>

            <p className="text-small text-ink-3 min-h-[20px]">
              {previewMonthly
                ? <>You'd need <span className="font-semibold text-ink num">{inr(previewMonthly)}</span> a month for {durationMonths} months.</>
                : "Add a target and months to see the monthly amount."}
            </p>

            <Button size="lg" onClick={handleSubmit} disabled={creatingGoal || !canCreate}>
              {creatingGoal ? "Creating your goal and plan…" : "Create goal"}
            </Button>
          </div>
        )}
      </div>

      {activeGoals.length === 0 && !creatingGoal && (
        <EmptyState icon={Target} title="No active goals yet"
                    body="Name what you're saving for and FinTwin builds a month-by-month plan around your real spending." />
      )}

      {/* Active goals */}
      <div className="space-y-3">
        {activeGoals.map((goal) => {
          const progress = Math.round(goal.progressPercent || 0);
          const open = expandedIds.has(goal.id);
          const due = deadline(goal);
          const left = Math.max(0, (goal.targetAmount || 0) - (goal.expectedSaved || 0));
          const linked = sipLinks[goal.id];
          const sipAmt = parseFloat(linked?.monthlyAmount) || 0;
          const sipTotal = sipAmt * (goal.durationMonths || 12);
          const sipPct = goal.targetAmount > 0 ? Math.min(Math.round(sipTotal / goal.targetAmount * 100), 100) : 0;
          return (
            <article key={goal.id} className="rounded-card bg-surface border border-line">
              <button type="button" onClick={() => toggleExpanded(goal.id)} aria-expanded={open}
                      aria-label={`${goal.title}, ${progress}%`} className="w-full text-left px-4 pt-4 pb-3.5">
                <div className="flex items-center gap-2">
                  <h3 className="min-w-0 truncate text-heading text-ink">{goal.title}</h3>
                  <Badge tone={healthTone(goal.goalHealth)}>{goal.goalHealth}</Badge>
                  <span className="ml-auto text-body font-semibold text-ink num shrink-0">{progress}%</span>
                  <ChevronDown size={16} aria-hidden className={cx("shrink-0 text-ink-3 transition-transform", open && "rotate-180")} />
                </div>
                <p className="mt-1 text-small text-ink-3 num">
                  {inr(goal.expectedSaved)} of {inr(goal.targetAmount)}
                  {due && <> · {timeLeft(due)}</>}
                </p>
                <Progress className="mt-3" value={progress} tone={progress >= 100 ? "good" : "accent"} label={`${goal.title} progress`} />
              </button>

              {open && (
                <div className="border-t border-line">
                  {confirmDeleteId === goal.id && (
                    <div className="m-4 p-3 rounded-control bg-surface-sunken">
                      <p className="text-small text-ink">Delete <strong>{goal.title}</strong>? Its plan can't be recovered.</p>
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="danger" disabled={deletingGoalId === goal.id}
                                onClick={async () => {
                                  setDeletingGoalId(goal.id);
                                  try { await deleteGoal(goal.id); setConfirmDeleteId(null); } finally { setDeletingGoalId(null); }
                                }}>
                          {deletingGoalId === goal.id ? "Deleting…" : "Delete"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}

                  {progress >= 100 && (
                    <div className="px-4 pt-4">
                      <Button size="lg" icon={Trophy} disabled={completingGoalId === goal.id}
                              onClick={async () => {
                                setCompletingGoalId(goal.id);
                                try { await completeGoal(goal.id); } finally { setCompletingGoalId(null); }
                              }}>
                        {completingGoalId === goal.id ? "Marking complete…" : "Mark as complete"}
                      </Button>
                    </div>
                  )}

                  <ul className="divide-y divide-line">
                    {[
                      ["Left to save", inr(left)],
                      ["Needed each month", inr(goal.monthlyTarget)],
                      ["You save each month", inr(goal.availableSavings)],
                      ["Chance of making it", `${goal.successProbability ?? 0}%`],
                      due && ["Target date", due.label],
                    ].filter(Boolean).map(([label, value]) => (
                      <li key={label} className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="text-body text-ink-2">{label}</span>
                        <span className="text-body font-semibold text-ink num">{value}</span>
                      </li>
                    ))}
                  </ul>

                  {editingGoalId === goal.id && (
                    <div className="mx-4 mb-4 p-3 rounded-control bg-surface-sunken space-y-2">
                      <input className={cx(INPUT, "bg-surface")} value={editTitle} onChange={(e) => setEditTitle(capitalizeFirst(e.target.value))} placeholder="Goal name" aria-label="Goal name" />
                      <div className="grid grid-cols-2 gap-2">
                        <input className={cx(INPUT, "bg-surface")} type="number" inputMode="numeric" value={editTargetAmount} onChange={(e) => setEditTargetAmount(e.target.value)} placeholder="Target ₹" aria-label="Target amount" />
                        <input className={cx(INPUT, "bg-surface")} type="number" inputMode="numeric" value={editDurationMonths} onChange={(e) => setEditDurationMonths(e.target.value)} placeholder="Months" aria-label="Duration in months" />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={async () => { await updateGoal(goal.id, { title: editTitle, targetAmount: Number(editTargetAmount), durationMonths: Number(editDurationMonths) }); setEditingGoalId(null); }}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingGoalId(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}

                  <div className="px-4 pt-1">
                    <AIPlanCard plan={goal.aiPlan} regenerating={loadingGoalId === goal.id} />
                  </div>

                  {/* A SIP put towards this goal */}
                  <div className="px-4 pb-1">
                    {linked ? (
                      <div className="mb-3 p-3 rounded-control bg-surface-sunken">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-small text-ink-3">Linked SIP</p>
                            <p className="text-body text-ink truncate">{linked.fundName || "SIP"}</p>
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => removeSIPLink(goal.id)} className="-mr-2">Unlink</Button>
                        </div>
                        <p className="mt-1 text-small text-ink-2 num">
                          {inr(sipAmt)} a month · {inr(sipTotal)} by the end · covers {sipPct}%
                        </p>
                        <Progress className="mt-2" value={sipPct} tone={sipPct >= 100 ? "good" : "accent"} label="Share covered by the SIP" />
                        <p className="mt-1.5 text-small text-ink-3">
                          {sipPct >= 100 ? "The SIP alone covers this goal." : `${inr((goal.targetAmount || 0) - sipTotal)} more from other savings.`}
                        </p>
                      </div>
                    ) : sipLinkOpen === goal.id ? (
                      <div className="mb-3 p-3 rounded-control bg-surface-sunken space-y-2">
                        <input className={cx(INPUT, "bg-surface")} placeholder="Fund name" aria-label="Fund name"
                               value={sipLinkForm.fundName} onChange={e => setSIPLinkForm(f => ({ ...f, fundName: e.target.value }))} />
                        <input type="number" inputMode="numeric" className={cx(INPUT, "bg-surface")} placeholder="Monthly SIP ₹" aria-label="Monthly SIP amount"
                               value={sipLinkForm.monthlyAmount} onChange={e => setSIPLinkForm(f => ({ ...f, monthlyAmount: e.target.value }))} />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => saveSIPLink(goal.id)} disabled={!sipLinkForm.monthlyAmount}>Link SIP</Button>
                          <Button size="sm" variant="ghost" onClick={() => setSIPLinkOpen(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2 px-4 pb-4">
                    <Button size="sm" variant="secondary" icon={Pencil} onClick={() => startEdit(goal)}>Edit</Button>
                    <Button size="sm" variant="secondary" icon={RefreshCw} disabled={loadingGoalId === goal.id}
                            onClick={async () => {
                              setLoadingGoalId(goal.id);
                              try { await regenerateGoal(goal.id); } finally { setLoadingGoalId(null); }
                            }}>
                      {loadingGoalId === goal.id ? "Rewriting…" : "New plan"}
                    </Button>
                    {!linked && sipLinkOpen !== goal.id && (
                      <Button size="sm" variant="secondary" icon={Link}
                              onClick={() => { setSIPLinkOpen(goal.id); setSIPLinkForm({ fundName: "", monthlyAmount: "" }); }}>
                        Link SIP
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" icon={Trash2} className="text-bad ml-auto" onClick={() => setConfirmDeleteId(goal.id)} aria-label="Delete goal">
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {completedGoals.length > 0 && (
        <section aria-label="Completed goals" className="mt-8">
          <SectionHeader title="Completed" />
          <ul className="rounded-card bg-surface border border-line divide-y divide-line">
            {completedGoals.map(g => (
              <li key={g.id} className="flex items-center gap-3 px-4 py-3">
                <span className="shrink-0 w-8 h-8 rounded-full bg-good-soft text-good flex items-center justify-center"><Check size={16} aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body text-ink truncate">{g.title}</span>
                  {g.completedAt && <span className="block text-small text-ink-3">Done {g.completedAt}</span>}
                </span>
                <span className="text-body font-semibold text-ink num">{inr(g.targetAmount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const INPUT = "flex-1 min-w-0 w-full h-11 rounded-control bg-surface-sunken border border-transparent px-3 text-body text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent";

export default FinancialGoalsSection;
