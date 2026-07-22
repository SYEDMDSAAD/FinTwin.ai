import { useState, useEffect, useRef } from "react";
import { ChevronDown, Trophy, TrendingUp, Check } from "lucide-react";
import GlassCard from "./GlassCard";

// showPercent=false (completed goals) renders a "Done" check instead of "100%"
// on every row — the number is always 100 there, so it carries no information.
function GoalRow({ goal, accentColor, showPercent }) {
  const pct = Math.round(goal.progressPercent || 0);
  return (
    <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{goal.title}</span>
        {showPercent ? (
          <span style={{ fontSize: 13, fontWeight: 700, color: accentColor, flexShrink: 0 }}>{pct}%</span>
        ) : (
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: accentColor, flexShrink: 0 }}>
            <Check size={12} /> Done
          </span>
        )}
      </div>

      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden", marginTop: 10, marginBottom: 10 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: accentColor, borderRadius: 4, transition: "width 0.6s ease" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, fontSize: 11 }}>
        <div><span style={{ color: "var(--text-dim)" }}>Target: </span><span style={{ color: "var(--text-primary)", fontWeight: 600 }}>₹{goal.targetAmount?.toLocaleString("en-IN")}</span></div>
        <div><span style={{ color: "var(--text-dim)" }}>Saved: </span><span style={{ color: "var(--text-primary)", fontWeight: 600 }}>₹{Math.round(goal.expectedSaved || 0).toLocaleString("en-IN")}</span></div>
        <div><span style={{ color: "var(--text-dim)" }}>Duration: </span><span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{goal.durationMonths}m</span></div>
        {goal.completed ? (
          <div><span style={{ color: "var(--text-dim)" }}>Completed: </span><span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{goal.completedAt}</span></div>
        ) : (
          <div><span style={{ color: "var(--text-dim)" }}>Health: </span><span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{goal.goalHealth}</span></div>
        )}
      </div>
    </div>
  );
}

// Ongoing / Completed are their own bordered boxes, each independently
// collapsible — its header row is the toggle. Collapsed shows just the box
// header (icon + label + count); expanded reveals the goal list, each row
// with its name, percentage/Done badge, and full detail.
function GoalGroupBox({ label, icon, goals, expanded, onToggle, accentColor, showPercent }) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 14, background: "rgba(255,255,255,0.015)" }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", background: "none", border: "none", padding: 0,
          cursor: "pointer", fontFamily: "inherit", textAlign: "left",
          marginBottom: expanded ? 10 : 0,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: accentColor }}>
          {icon} {label} ({goals.length})
        </span>
        <ChevronDown
          size={15}
          style={{ color: accentColor, flexShrink: 0, transition: "transform 0.2s ease", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>
      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {goals.map(g => <GoalRow key={g.id} goal={g} accentColor={accentColor} showPercent={showPercent} />)}
        </div>
      )}
    </div>
  );
}

// Collapsed (default): just the ONGOING / COMPLETED boxes with counts, no
// goal rows. Each box toggles independently. Clicking anywhere outside this
// card collapses both back down.
function GoalsOverviewCard({ goals }) {
  const [ongoingOpen, setOngoingOpen] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOngoingOpen(false);
        setCompletedOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  if (!goals || goals.length === 0) return null;

  const completedGoals = goals.filter(g => g.completed);
  const ongoingGoals = goals.filter(g => !g.completed);

  return (
    <div ref={rootRef}>
    <GlassCard className="relative overflow-hidden p-6 mb-6 border border-white/10 bg-white/[0.03] backdrop-blur-xl">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div>
        <h3 style={{ fontSize: 19, fontWeight: 800, color: "var(--text-primary)", margin: 0, lineHeight: 1.3 }}>Goals Overview</h3>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", letterSpacing: "0.02em", marginTop: 2, lineHeight: 1.3 }}>
          {completedGoals.length} Completed · {ongoingGoals.length} Ongoing
        </div>
      </div>

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        {ongoingGoals.length > 0 && (
          <GoalGroupBox
            label="ONGOING" icon={<TrendingUp size={13} color="#22d3ee" />} goals={ongoingGoals}
            expanded={ongoingOpen} onToggle={() => setOngoingOpen(o => !o)}
            accentColor="#22d3ee" showPercent
          />
        )}
        {completedGoals.length > 0 && (
          <GoalGroupBox
            label="COMPLETED" icon={<Trophy size={13} color="#4ade80" />} goals={completedGoals}
            expanded={completedOpen} onToggle={() => setCompletedOpen(o => !o)}
            accentColor="#4ade80" showPercent={false}
          />
        )}
      </div>
    </GlassCard>
    </div>
  );
}

export default GoalsOverviewCard;
