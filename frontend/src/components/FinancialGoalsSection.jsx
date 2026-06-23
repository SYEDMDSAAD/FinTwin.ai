import ReactMarkdown from "react-markdown";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { Target, Zap, Edit2, Trash2, RefreshCw, Link, RefreshCcw } from "lucide-react";
import GlassCard from "./GlassCard";

const SIP_LINKS_KEY = "fintwin-goal-sip-links";
function getSIPLinks() { try { return JSON.parse(localStorage.getItem(SIP_LINKS_KEY)) || {}; } catch { return {}; } }
function saveSIPLinks(m) { localStorage.setItem(SIP_LINKS_KEY, JSON.stringify(m)); }

function FinancialGoalsSection({ goals, createGoal, updateGoal, deleteGoal, regenerateGoal }) {

  const [title, setTitle] = useState("");
  
  const [targetAmount, setTargetAmount] = useState("");
  
  const [durationMonths, setDurationMonths] = useState("");
  
  const [loadingGoalId, setLoadingGoalId] = useState(null);
  
  const [creatingGoal, setCreatingGoal] = useState(false);
  
  const [editingGoalId, setEditingGoalId] = useState(null);
  
  const [editTitle, setEditTitle] = useState("");
  
  const [editTargetAmount, setEditTargetAmount] = useState("");
  
  const [editDurationMonths, setEditDurationMonths] = useState("");

  const [sipLinks, setSIPLinks] = useState(getSIPLinks);
  const [sipLinkOpen, setSIPLinkOpen] = useState(null);
  const [sipLinkForm, setSIPLinkForm] = useState({ fundName: "", monthlyAmount: "" });

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

  const canCreate = title.trim() && targetAmount && Number(targetAmount) > 0 && durationMonths && Number(durationMonths) > 0;

  const handleSubmit = async () => {
  
    if (!canCreate) { toast.error("Please fill all fields."); return; }
    setCreatingGoal(true);
    try {
      await createGoal({ title, targetAmount: Number(targetAmount), durationMonths: Number(durationMonths) });
      setTitle(""); setTargetAmount(""); setDurationMonths("");
    } finally { setCreatingGoal(false); }
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

          <div
              className="
                  w-10
                  h-10
                  rounded-xl
                  flex
                  items-center
                  justify-center
                  bg-purple-500/10
                  border
                  border-purple-500/20
              "
          >
              <Target
                  size={18}
                  className="text-purple-300"
              />
          </div>

          <div>

              <div
                  className="
                      text-[11px]
                      font-bold
                      tracking-[0.12em]
                      text-zinc-500
                  "
              >
                  GOALS PLANNER
              </div>

              <h2
                  className="
                      text-lg
                      font-bold
                  "
              >
                  AI Savings Planner
              </h2>

          </div>

      </div>

        {/* ── Create Goal ── */}
        <GlassCard
              className="
                  relative
                  overflow-hidden
                  p-6
                  mb-6
                  border
                  border-white/10
                  bg-white/[0.03]
                  backdrop-blur-xl
              "
          >

            <div
                className="
                    absolute
                    inset-x-0
                    top-0
                    h-px
                    bg-gradient-to-r
                    from-transparent
                    via-white/20
                    to-transparent
                "
            />
          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em", marginBottom: 14 }}>NEW GOAL</div>
          <div
              className="
                  grid
                  grid-cols-1
                  md:grid-cols-3
                  gap-3
                  mb-4
              "
          >
            <input className="goal-input" placeholder="Goal title (e.g. Emergency Fund)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input className="goal-input" type="number" placeholder="Target amount (₹)" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} />
            <input className="goal-input" type="number" placeholder="Duration (months)" value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} />
          </div>
          <button
            className="g-btn"
            disabled={creatingGoal || !canCreate}
            onClick={handleSubmit}
            style={{ background: canCreate && !creatingGoal ? "linear-gradient(135deg, #a78bfa, #7c3aed)" : "rgba(255,255,255,0.06)", color: canCreate ? "#fff" : "rgba(148,163,184,0.4)" }}
          >
            <Zap size={14} />
            {creatingGoal ? "Creating with AI..." : "Create AI Goal"}
          </button>
        </GlassCard>

        {/* ── Goals Grid ── */}
        <div
            className="
                grid
                grid-cols-1
                xl:grid-cols-2
                gap-4
            "
        >
          {goals.map((goal) => {
            const progress = goal.progressPercent || 0;
            const hc = healthColor(goal.goalHealth);
            return (
              <GlassCard
                key={goal.id}
                className="
                    relative
                    overflow-hidden
                    p-6
                    border
                    border-white/10
                    bg-white/[0.03]
                    backdrop-blur-xl
                    hover:border-purple-500/20
                    transition-all
                    duration-300
                "
            >

                <div
                    className="
                        absolute
                        inset-x-0
                        top-0
                        h-px
                        bg-gradient-to-r
                        from-transparent
                        via-white/20
                        to-transparent
                    "
                />

                {/* Top row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <h3
                        className="
                            text-lg
                            font-bold
                            text-white
                            mb-1
                        "
                    >
                      {goal.title}
                    </h3>

                    <span
                        className="
                            text-[10px]
                            font-bold
                            px-2
                            py-1
                            rounded-md
                        "
                        style={{
                            color: hc,
                            backgroundColor: `${hc}18`
                        }}
                    >
                      {goal.goalHealth}
                    </span>
                  </div>
                  <div className="flex gap-2">

                    <button
                        onClick={() => {
                            setEditingGoalId(goal.id);
                            setEditTitle(goal.title);
                            setEditTargetAmount(goal.targetAmount);
                            setEditDurationMonths(goal.durationMonths);
                        }}
                        className="
                            w-9
                            h-9
                            rounded-lg
                            flex
                            items-center
                            justify-center
                            bg-cyan-500/10
                            border
                            border-cyan-500/20
                            text-cyan-300
                            hover:bg-cyan-500/20
                            transition-all
                            duration-200
                        "
                    >
                        <Edit2 size={14} />
                    </button>

                    <button
                        onClick={() => deleteGoal(goal.id)}
                        className="
                            w-9
                            h-9
                            rounded-lg
                            flex
                            items-center
                            justify-center
                            bg-red-500/10
                            border
                            border-red-500/20
                            text-red-300
                            hover:bg-red-500/20
                            transition-all
                            duration-200
                        "
                    >
                        <Trash2 size={14} />
                    </button>

                </div>
                </div>

                {/* Amount + Progress */}
                <div style={{ marginBottom: 16 }}>
                  <div
                      className="
                          flex
                          justify-between
                          items-center
                          mb-2
                      "
                  >
                    <span className="text-sm text-zinc-500">
                      ₹{goal.expectedSaved?.toLocaleString("en-IN")} / ₹{goal.targetAmount?.toLocaleString("en-IN")}
                    </span>
                    <span className="text-xs font-bold text-purple-400">
                      {progress}%
                    </span>
                  </div>
                  <div
                    className="
                        w-full
                        h-2
                        bg-white/5
                        rounded-full
                        overflow-hidden
                    "
                >

                    <div
                        style={{
                            width: `${progress}%`
                        }}
                        className="
                            h-full
                            rounded-full
                            bg-gradient-to-r
                            from-purple-500
                            via-violet-500
                            to-cyan-400
                            transition-all
                            duration-700
                        "
                    />

                </div>
                </div>

                {/* Meta */}
                <div
                  className="
                      grid
                      grid-cols-2
                      gap-3
                      my-5
                  "
              >

                  <div
                      className="
                          bg-white/[0.02]
                          border
                          border-white/10
                          rounded-xl
                          p-3
                      "
                  >
                      <p className="text-[10px] text-zinc-500 uppercase">
                          Success
                      </p>

                      <p className="text-green-400 font-bold">
                          {goal.successProbability}%
                      </p>
                  </div>

                  <div
                      className="
                          bg-white/[0.02]
                          border
                          border-white/10
                          rounded-xl
                          p-3
                      "
                  >
                      <p className="text-[10px] text-zinc-500 uppercase">
                          Duration
                      </p>

                      <p className="text-white font-bold">
                          {goal.durationMonths}m
                      </p>
                  </div>

                  <div
                      className="
                          bg-white/[0.02]
                          border
                          border-white/10
                          rounded-xl
                          p-3
                      "
                  >
                      <p className="text-[10px] text-zinc-500 uppercase">
                          Monthly
                      </p>

                      <p className="text-cyan-400 font-bold">
                          ₹{Math.round(goal.monthlyTarget || 0).toLocaleString("en-IN")}
                      </p>
                  </div>

                  <div
                      className="
                          bg-white/[0.02]
                          border
                          border-white/10
                          rounded-xl
                          p-3
                      "
                  >
                      <p className="text-[10px] text-zinc-500 uppercase">
                          Savings
                      </p>

                      <p className="text-purple-400 font-bold">
                          ₹{goal.availableSavings?.toLocaleString()}
                      </p>
                  </div>

              </div>

                {/* Edit form */}
                {editingGoalId === goal.id && (
                  <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 16, marginBottom: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.08em", marginBottom: 4 }}>EDIT GOAL</div>
                    <input className="goal-input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title" />
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
                <div
                  className="
                      bg-white/[0.02]
                      border
                      border-purple-500/10
                      rounded-xl
                      p-4
                      mb-4
                  "
              >
                  <div
                      className="
                          text-[10px]
                          font-bold
                          tracking-[0.1em]
                          text-purple-400/60
                          mb-2
                      "
                  >
                      AI PLAN
                  </div>
                  <div
                    className="
                        text-[15px]
                        text-zinc-300
                        leading-7
                    "
                >
                    <ReactMarkdown>{goal.aiPlan}</ReactMarkdown>
                </div>
                </div>

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
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{linked.fundName || "SIP Investment"}</div>
                            </div>
                            <button onClick={() => removeSIPLink(goal.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(248,113,113,0.5)", fontSize: 11, fontFamily: "inherit" }}>Remove</button>
                          </div>
                          <div style={{ display: "flex", gap: 14, marginBottom: 8 }}>
                            <div>
                              <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>MONTHLY SIP</div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: "#a78bfa" }}>₹{sipAmt.toLocaleString("en-IN")}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>COVERS GOAL</div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: sipPct >= 100 ? "#4ade80" : "#fbbf24" }}>{sipPct}%</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>SIP TOTAL</div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>₹{sipTotal.toLocaleString("en-IN")}</div>
                            </div>
                          </div>
                          <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${sipPct}%`, background: sipPct >= 100 ? "linear-gradient(90deg,#4ade80,#22d3ee)" : "linear-gradient(90deg,#a78bfa,#fbbf24)", borderRadius: 4, transition: "width 0.5s ease" }} />
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 5 }}>
                            {sipPct >= 100 ? "✓ SIP alone will fully fund this goal" : `Need ₹${(goal.targetAmount - sipTotal).toLocaleString("en-IN")} more from manual savings`}
                          </div>
                        </div>
                      ) : (
                        <div>
                          {sipLinkOpen === goal.id ? (
                            <div style={{ background: "rgba(167,139,250,0.04)", border: "1px solid rgba(167,139,250,0.12)", borderRadius: 12, padding: 14 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(167,139,250,0.6)", letterSpacing: "0.08em", marginBottom: 10 }}>LINK A SIP TO THIS GOAL</div>
                              <input
                                style={{ width: "100%", padding: "8px 10px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", fontSize: 12, outline: "none", marginBottom: 8, boxSizing: "border-box", fontFamily: "inherit" }}
                                placeholder="Fund name (e.g. Parag Parikh Flexi Cap)"
                                value={sipLinkForm.fundName}
                                onChange={e => setSIPLinkForm(f => ({ ...f, fundName: e.target.value }))}
                              />
                              <input
                                type="number"
                                style={{ width: "100%", padding: "8px 10px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", fontSize: 12, outline: "none", marginBottom: 10, boxSizing: "border-box", fontFamily: "inherit" }}
                                placeholder="Monthly SIP amount (₹)"
                                value={sipLinkForm.monthlyAmount}
                                onChange={e => setSIPLinkForm(f => ({ ...f, monthlyAmount: e.target.value }))}
                              />
                              <div style={{ display: "flex", gap: 8 }}>
                                <button onClick={() => setSIPLinkOpen(null)} style={{ padding: "7px 14px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.08)", background: "none", color: "rgba(148,163,184,0.5)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                                <button onClick={() => saveSIPLink(goal.id)} style={{ flex: 1, padding: "7px 0", borderRadius: 9, border: "none", background: "rgba(167,139,250,0.15)", color: "#a78bfa", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Link SIP</button>
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
                      className={`
                          flex
                          items-center
                          justify-center
                          gap-2
                          px-4
                          py-2
                          rounded-xl
                          border
                          transition-all
                          duration-200

                          ${
                              loadingGoalId === goal.id

                              ? "bg-white/5 border-white/10 text-zinc-500"

                              : "bg-purple-500/10 border-purple-500/20 text-purple-300 hover:bg-purple-500/20"
                          }
                      `}
                  >
                                  
                  <RefreshCw size={13} style={{ animation: loadingGoalId === goal.id ? "spin 1s linear infinite" : "none" }} />
                  {loadingGoalId === goal.id ? "Regenerating..." : "Regenerate AI Plan"}
                </button>
              </GlassCard>
            );
          })}
        </div>

      </div>
    </>
  );
}

export default FinancialGoalsSection;
