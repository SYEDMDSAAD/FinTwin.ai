import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-hot-toast";
import { Target, Zap, Edit2, Trash2, RefreshCw, Link, Trophy, ChevronDown, Sparkles, CalendarClock, Wallet, TrendingUp, Plus } from "lucide-react";
import AIPlanCard from "./AIPlanCard";
import GlassCard from "./GlassCard";
import GoalsOverviewCard from "./GoalsOverviewCard";
import AnimatedDots from "./AnimatedDots";

const SIP_LINKS_KEY = "fintwin-goal-sip-links";
function getSIPLinks() { try { return JSON.parse(localStorage.getItem(SIP_LINKS_KEY)) || {}; } catch { return {}; } }
function saveSIPLinks(m) { localStorage.setItem(SIP_LINKS_KEY, JSON.stringify(m)); }

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

// Compact form for the summary tiles, where the exact rupee is noise.
function compactINR(n) {
  const v = Math.round(Number(n) || 0);
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(v >= 1e8 ? 0 : 1)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(v >= 1e6 ? 0 : 1)}L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}K`;
  return `₹${v}`;
}

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

const HEALTHY = ["Excellent", "On Track", "Good"];

function StatTile({ icon, label, value, color }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}18`, color }}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-500">{label}</div>
        <div className="truncate text-[15px] font-bold" style={{ color }}>{value}</div>
      </div>
    </div>
  );
}

function FinancialGoalsSection({ goals, createGoal, updateGoal, deleteGoal, regenerateGoal, completeGoal }) {

  const [title, setTitle] = useState("");

  const [targetAmount, setTargetAmount] = useState("");

  const [durationMonths, setDurationMonths] = useState("");

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

  const [sipLinks, setSIPLinks] = useState(getSIPLinks);
  const [sipLinkOpen, setSIPLinkOpen] = useState(null);
  const [sipLinkForm, setSIPLinkForm] = useState({ fundName: "", monthlyAmount: "" });

  const [newGoalOpen, setNewGoalOpen] = useState(true);
  const [collapsedGoalIds, setCollapsedGoalIds] = useState(new Set());

  const toggleGoalCollapsed = (id) => {
    setCollapsedGoalIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const saveSIPLink = (goalId) => {
    if (!sipLinkForm.monthlyAmount) return;
    const next = { ...sipLinks, [goalId]: { ...sipLinkForm } };
    setSIPLinks(next); saveSIPLinks(next); setSIPLinkOpen(null);
  };
  const removeSIPLink = (goalId) => {
    const next = { ...sipLinks };
    delete next[goalId];
    setSIPLinks(next); saveSIPLinks(next);
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

  const healthColor = (h) =>
    h === "Excellent" || h === "On Track" ? "#4ade80"
    : h === "Good" ? "#22d3ee"
    : h === "Moderate" ? "#fbbf24"
    : "#f87171";

  return (
    <>
      <div className="goals-section" style={{ marginBottom: 32 }}>

        {/* ── Page Header ── */}
        <div className="flex items-center gap-3 mb-6">

          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-500/10 border border-purple-500/20">
              <Target size={18} className="text-purple-300" />
          </div>

          <div>

              <div className="text-[11px] font-bold tracking-[0.12em] text-zinc-500">
                  GOALS PLANNER
              </div>

              <h2 className="text-lg font-bold">
                  AI Savings Planner
              </h2>

          </div>

      </div>

        {/* ── Portfolio-level summary across every active goal ── */}
        {activeGoals.length > 0 && (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
            <StatTile icon={<Target size={15} />} label="Active goals" value={activeGoals.length} color="#a78bfa" />
            <StatTile icon={<Wallet size={15} />} label="Total target" value={compactINR(summary.target)} color="#e2e8f0" />
            <StatTile icon={<TrendingUp size={15} />} label="Saved so far" value={compactINR(summary.saved)} color="#22d3ee" />
            <StatTile icon={<CalendarClock size={15} />} label="Needed / month" value={compactINR(summary.monthly)} color="#4ade80" />
          </div>
        )}

        {/* ── Goals Overview (completed + ongoing, collapsible) ── */}
        <GoalsOverviewCard goals={goals} />

        {/* ── Create Goal ── */}
        <GlassCard className="relative overflow-hidden p-6 mb-6 border border-white/10 bg-white/[0.03] backdrop-blur-xl">

            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <button
            type="button"
            onClick={() => setNewGoalOpen(o => !o)}
            aria-expanded={newGoalOpen}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              width: "100%", background: "none", border: "none", padding: 0,
              cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              marginBottom: newGoalOpen ? 14 : 0,
            }}
          >
            {newGoalOpen ? (
              <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em" }}>NEW GOAL</span>
            ) : (
              <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>Create New Goal</span>
            )}
            <ChevronDown size={18} style={{ color: "var(--text-primary)", flexShrink: 0, transition: "transform 0.2s ease", transform: newGoalOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
          </button>

          {newGoalOpen && (
            <>
              {/* Presets — fastest path from "I should save" to a real goal */}
              <div className="flex flex-wrap gap-2 mb-4">
                {GOAL_PRESETS.map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-zinc-400 transition-all duration-200 hover:border-purple-500/30 hover:bg-purple-500/10 hover:text-purple-300"
                  >
                    <Plus size={11} /> {p.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3" onKeyDown={handleFormKeyDown}>
                <input className="goal-input col-span-2 md:col-span-1" placeholder="Goal title (e.g. Emergency Fund)" value={title} onChange={(e) => setTitle(capitalizeFirst(e.target.value))} />
                <input className="goal-input" type="number" placeholder="Target amount (₹)" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} />
                <input className="goal-input" type="number" placeholder="Duration (months)" value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} />
              </div>

              <div className="mb-4 min-h-[18px] text-xs">
                {previewMonthly ? (
                  <span className="text-zinc-500">
                    You'd need <span className="font-bold text-cyan-400">{inr(previewMonthly)}</span> per month for {durationMonths} months.
                  </span>
                ) : (
                  <span className="text-zinc-600">Enter a target and duration to preview the monthly amount.</span>
                )}
              </div>

              <button
                className="g-btn"
                disabled={creatingGoal || !canCreate}
                onClick={handleSubmit}
                style={{
                  position: "relative", overflow: "hidden",
                  background: canCreate && !creatingGoal ? "linear-gradient(135deg, #a78bfa, #7c3aed)" : "var(--bg-subtle)",
                  color: canCreate && !creatingGoal ? "#fff" : "var(--text-dim)",
                }}
              >
                <AnimatePresence mode="wait">
                  {creatingGoal ? (
                    <motion.span key="creating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} style={{ display: "flex" }}>
                        <Sparkles size={14} />
                      </motion.span>
                      <span>Creating your goal<AnimatedDots /></span>
                    </motion.span>
                  ) : (
                    <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Zap size={14} />
                      Create AI Goal
                    </motion.span>
                  )}
                </AnimatePresence>
                {creatingGoal && (
                  <motion.span
                    style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)" }}
                    animate={{ x: ["-100%", "100%"] }}
                    transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                  />
                )}
              </button>
            </>
          )}
        </GlassCard>

        {/* ── Empty state ── */}
        {activeGoals.length === 0 && !creatingGoal && (
          <GlassCard className="relative overflow-hidden border border-white/10 bg-white/[0.03] p-10 text-center backdrop-blur-xl">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-500/20 bg-purple-500/10">
              <Target size={22} className="text-purple-300" />
            </div>
            <h3 className="mb-1 text-base font-bold">No active goals yet</h3>
            <p className="mx-auto mb-5 max-w-sm text-sm text-zinc-500">
              Name what you're saving for and FinTwin will build a month-by-month plan around your actual spending.
            </p>
            <button
              type="button"
              onClick={() => setNewGoalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-purple-500/20 bg-purple-500/10 px-4 py-2 text-sm font-semibold text-purple-300 transition-all duration-200 hover:bg-purple-500/20"
            >
              <Zap size={14} /> Create your first goal
            </button>
          </GlassCard>
        )}

        {/* ── Goals Grid ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {activeGoals.map((goal) => {
            const progress = Math.round(goal.progressPercent || 0);
            const hc = healthColor(goal.goalHealth);
            const isCollapsed = collapsedGoalIds.has(goal.id);
            const due = deadline(goal);
            return (
              <motion.div
                key={goal.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="self-start"
              >
              <GlassCard className="relative overflow-hidden p-6 border border-white/10 bg-white/[0.03] backdrop-blur-xl hover:border-purple-500/20 transition-all duration-300">

                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                {/* Top row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-white mb-1.5 truncate">
                      {goal.title}
                    </h3>

                    <div className="flex flex-wrap items-center gap-2">
                      <span
                          className="text-[10px] font-bold px-2 py-1 rounded-md"
                          style={{ color: hc, backgroundColor: `${hc}18` }}
                      >
                        {goal.goalHealth}
                      </span>

                      {due && (
                        <span className="flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-zinc-400">
                          <CalendarClock size={10} />
                          {due.monthsLeft > 0
                            ? `${due.monthsLeft}m left · ${due.label}`
                            : due.monthsLeft === 0 ? `Due this month` : `Overdue since ${due.label}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">

                    <button
                        onClick={() => toggleGoalCollapsed(goal.id)}
                        aria-label={isCollapsed ? "Expand goal details" : "Collapse goal details"}
                        aria-expanded={!isCollapsed}
                        title={isCollapsed ? "Expand" : "Collapse"}
                        className="w-9 h-9 rounded-lg flex items-center justify-center bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:bg-purple-500/20 transition-all duration-200"
                    >
                        <ChevronDown size={14} style={{ transition: "transform 0.2s ease", transform: isCollapsed ? "rotate(0deg)" : "rotate(180deg)" }} />
                    </button>

                    <button
                        onClick={() => {
                            setEditingGoalId(goal.id);
                            setEditTitle(goal.title);
                            setEditTargetAmount(goal.targetAmount);
                            setEditDurationMonths(goal.durationMonths);
                            setCollapsedGoalIds(prev => {
                              const next = new Set(prev);
                              next.delete(goal.id);
                              return next;
                            });
                        }}
                        aria-label="Edit goal"
                        title="Edit goal"
                        className="w-9 h-9 rounded-lg flex items-center justify-center bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20 transition-all duration-200"
                    >
                        <Edit2 size={14} />
                    </button>

                    <button
                        onClick={() => setConfirmDeleteId(goal.id)}
                        aria-label="Delete goal"
                        title="Delete goal"
                        className="w-9 h-9 rounded-lg flex items-center justify-center bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20 transition-all duration-200"
                    >
                        <Trash2 size={14} />
                    </button>

                </div>
                </div>

                {/* Delete confirmation */}
                <AnimatePresence>
                  {confirmDeleteId === goal.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{ overflow: "hidden" }}
                    >
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-3">
                        <span className="text-xs text-red-200">
                          Delete <strong>{goal.title}</strong>? Its AI plan can't be recovered.
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:bg-white/5"
                          >
                            Cancel
                          </button>
                          <button
                            disabled={deletingGoalId === goal.id}
                            onClick={async () => {
                              setDeletingGoalId(goal.id);
                              try {
                                await deleteGoal(goal.id);
                                setConfirmDeleteId(null);
                              } finally {
                                setDeletingGoalId(null);
                              }
                            }}
                            className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/30 disabled:opacity-60"
                          >
                            {deletingGoalId === goal.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Amount + Progress */}
                <div style={{ marginBottom: 16 }}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-zinc-500">
                      {inr(goal.expectedSaved)} / {inr(goal.targetAmount)}
                    </span>
                    <span className="text-xs font-bold text-purple-400">
                      {progress}%
                    </span>
                  </div>
                  <div
                    className="w-full h-2 bg-white/5 rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${goal.title} progress`}
                >

                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(progress, 100)}%` }}
                        transition={{ duration: 0.7, ease: "easeOut" }}
                        className="h-full rounded-full bg-gradient-to-r from-purple-500 via-violet-500 to-cyan-400"
                    />

                </div>
                  {progress < 100 && (
                    <div className="mt-2 text-[11px] text-zinc-500">
                      {inr((goal.targetAmount || 0) - (goal.expectedSaved || 0))} to go
                    </div>
                  )}
                </div>

                {!isCollapsed && (
                <>
                {/* Mark complete — only once the goal has genuinely hit 100% */}
                {progress >= 100 && (
                  <button
                    disabled={completingGoalId === goal.id}
                    onClick={async () => {
                      setCompletingGoalId(goal.id);
                      try {
                        await completeGoal(goal.id);
                      } finally {
                        setCompletingGoalId(null);
                      }
                    }}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      width: "100%", padding: "10px 0", borderRadius: 12, marginBottom: 16,
                      border: "1px solid rgba(74,222,128,0.3)",
                      background: completingGoalId === goal.id ? "rgba(74,222,128,0.08)" : "rgba(74,222,128,0.15)",
                      color: "#4ade80", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    <Trophy size={14} />
                    {completingGoalId === goal.id ? "Marking Complete..." : "Mark Goal as Complete"}
                  </button>
                )}

                {/* Meta */}
                <div className="grid grid-cols-2 gap-3 my-5">

                  <div className="bg-white/[0.02] border border-white/10 rounded-xl p-3">
                      <p className="text-[10px] text-zinc-500 uppercase">Success</p>
                      <p className="text-green-400 font-bold">{goal.successProbability}%</p>
                  </div>

                  <div className="bg-white/[0.02] border border-white/10 rounded-xl p-3">
                      <p className="text-[10px] text-zinc-500 uppercase">Duration</p>
                      <p className="text-white font-bold">{goal.durationMonths}m</p>
                  </div>

                  <div className="bg-white/[0.02] border border-white/10 rounded-xl p-3">
                      <p className="text-[10px] text-zinc-500 uppercase">Monthly</p>
                      <p className="text-cyan-400 font-bold">{inr(goal.monthlyTarget)}</p>
                  </div>

                  <div className="bg-white/[0.02] border border-white/10 rounded-xl p-3">
                      <p className="text-[10px] text-zinc-500 uppercase">Savings</p>
                      <p className="text-purple-400 font-bold">{inr(goal.availableSavings)}</p>
                  </div>

              </div>

                {/* Edit form */}
                {editingGoalId === goal.id && (
                  <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 16, marginBottom: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.08em", marginBottom: 4 }}>EDIT GOAL</div>
                    <input className="goal-input" value={editTitle} onChange={(e) => setEditTitle(capitalizeFirst(e.target.value))} placeholder="Title" />
                    <input className="goal-input" type="number" value={editTargetAmount} onChange={(e) => setEditTargetAmount(e.target.value)} placeholder="Target amount" />
                    <input className="goal-input" type="number" value={editDurationMonths} onChange={(e) => setEditDurationMonths(e.target.value)} placeholder="Duration (months)" />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="g-btn" style={{ background: "rgba(74,222,128,0.2)", color: "#4ade80" }}
                        onClick={async () => { await updateGoal(goal.id, { title: editTitle, targetAmount: Number(editTargetAmount), durationMonths: Number(editDurationMonths) }); setEditingGoalId(null); }}>
                        Save Changes
                      </button>
                      <button className="g-btn" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(148,163,184,0.7)" }} onClick={() => setEditingGoalId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* AI Plan */}
                <AIPlanCard plan={goal.aiPlan} regenerating={loadingGoalId === goal.id} />

                {/* SIP Link */}
                {(() => {
                  const linked = sipLinks[goal.id];
                  const sipAmt = parseFloat(linked?.monthlyAmount) || 0;
                  const sipTotal = sipAmt * (goal.durationMonths || 12);
                  const sipPct = goal.targetAmount > 0 ? Math.min(Math.round(sipTotal / goal.targetAmount * 100), 100) : 0;
                  return (
                    <div style={{ marginBottom: 14 }}>
                      {linked ? (
                        <div style={{ background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 12, padding: "12px 14px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(167,139,250,0.6)", letterSpacing: "0.08em", marginBottom: 3 }}>LINKED SIP</div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{linked.fundName || "SIP Investment"}</div>
                            </div>
                            <button onClick={() => removeSIPLink(goal.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(248,113,113,0.5)", fontSize: 11, fontFamily: "inherit" }}>Remove</button>
                          </div>
                          <div style={{ display: "flex", gap: 14, marginBottom: 8 }}>
                            <div>
                              <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>MONTHLY SIP</div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: "#a78bfa" }}>{inr(sipAmt)}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>COVERS GOAL</div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: sipPct >= 100 ? "#4ade80" : "#fbbf24" }}>{sipPct}%</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>SIP TOTAL</div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{inr(sipTotal)}</div>
                            </div>
                          </div>
                          <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${sipPct}%`, background: sipPct >= 100 ? "linear-gradient(90deg,#4ade80,#22d3ee)" : "linear-gradient(90deg,#a78bfa,#fbbf24)", borderRadius: 4, transition: "width 0.5s ease" }} />
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 5 }}>
                            {sipPct >= 100 ? "✓ SIP alone will fully fund this goal" : `Need ${inr((goal.targetAmount || 0) - sipTotal)} more from manual savings`}
                          </div>
                        </div>
                      ) : (
                        <div>
                          {sipLinkOpen === goal.id ? (
                            <div style={{ background: "rgba(167,139,250,0.04)", border: "1px solid rgba(167,139,250,0.12)", borderRadius: 12, padding: 14 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(167,139,250,0.6)", letterSpacing: "0.08em", marginBottom: 10 }}>LINK A SIP TO THIS GOAL</div>
                              <input
                                className="goal-input"
                                style={{ marginBottom: 8 }}
                                placeholder="Fund name (e.g. Parag Parikh Flexi Cap)"
                                value={sipLinkForm.fundName}
                                onChange={e => setSIPLinkForm(f => ({ ...f, fundName: e.target.value }))}
                              />
                              <input
                                type="number"
                                className="goal-input"
                                style={{ marginBottom: 10 }}
                                placeholder="Monthly SIP amount (₹)"
                                value={sipLinkForm.monthlyAmount}
                                onChange={e => setSIPLinkForm(f => ({ ...f, monthlyAmount: e.target.value }))}
                              />
                              <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={() => setSIPLinkOpen(null)} style={{ padding: "7px 14px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.08)", background: "none", color: "rgba(148,163,184,0.5)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                                <button
                                  onClick={() => saveSIPLink(goal.id)}
                                  disabled={!sipLinkForm.monthlyAmount}
                                  style={{ flex: 1, padding: "7px 0", borderRadius: 9, border: "none", background: "rgba(167,139,250,0.15)", color: "#a78bfa", fontSize: 12, fontWeight: 700, cursor: sipLinkForm.monthlyAmount ? "pointer" : "not-allowed", opacity: sipLinkForm.monthlyAmount ? 1 : 0.5, fontFamily: "inherit" }}
                                >
                                  Link SIP
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setSIPLinkOpen(goal.id); setSIPLinkForm({ fundName: "", monthlyAmount: "" }); }}
                              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, border: "1px solid rgba(167,139,250,0.2)", background: "rgba(167,139,250,0.06)", color: "#a78bfa", fontSize: 12, fontWeight: 600, cursor: "pointer", marginBottom: 10, fontFamily: "inherit" }}
                            >
                              <Link size={12} /> Link Investment / SIP
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Regenerate */}
                <button
                      disabled={loadingGoalId === goal.id}
                      onClick={async () => {
                          setLoadingGoalId(goal.id);

                          try {
                              await regenerateGoal(goal.id);
                          } finally {
                              setLoadingGoalId(null);
                          }
                      }}
                      className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all duration-200 ${
                              loadingGoalId === goal.id
                              ? "bg-white/5 border-white/10 text-zinc-500"
                              : "bg-purple-500/10 border-purple-500/20 text-purple-300 hover:bg-purple-500/20"
                          }`}
                  >
                  <RefreshCw size={13} style={{ animation: loadingGoalId === goal.id ? "spin 1s linear infinite" : "none" }} />
                  {loadingGoalId === goal.id ? "Regenerating..." : "Regenerate AI Plan"}
                </button>
                </>
                )}
              </GlassCard>
              </motion.div>
            );
          })}
        </div>

      </div>
    </>
  );
}

export default FinancialGoalsSection;
