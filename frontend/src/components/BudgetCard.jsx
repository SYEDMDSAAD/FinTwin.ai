import { useState } from "react";
import { Trash2, ChevronDown, AlertTriangle, Pencil, Check, X } from "lucide-react";
import GlassCard from "./GlassCard";
import { budgetStatus } from "../constants/budgetStatus";

const rupees = (v) => `₹${Math.round(v || 0).toLocaleString("en-IN")}`;

function BudgetCard({ budget, onDelete, onUpdate }) {
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newLimit, setNewLimit] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setNewLimit(String(budget.limit ?? ""));
    setEditing(true);
    setCollapsed(false);
  };

  const saveLimit = async () => {
    const value = Number(newLimit);
    if (!newLimit || value <= 0 || value === budget.limit) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onUpdate(budget.id, value);
      setEditing(false);
    } catch {
      // toast already shown upstream; stay in edit mode so the value isn't lost
    } finally {
      setSaving(false);
    }
  };

  const { label, color, pct } = budgetStatus(budget);
  const barWidth = Math.min(pct, 100);
  const remaining = budget.remaining ?? (budget.limit || 0) - (budget.spent || 0);

  return (
    <GlassCard className="relative self-start overflow-hidden p-5">
      <div style={{ position: "absolute", insetInline: 0, top: 0, height: 2, background: color }} />

      {/* Header — category, status pill, controls */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <h3
            style={{
              fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
            title={budget.category}
          >
            {budget.category}
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color }}>{label}</span>
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>· {pct.toFixed(0)}% used</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <IconButton
            onClick={startEdit}
            title="Edit limit"
            tint="rgba(96,165,250,0.10)"
            border="rgba(96,165,250,0.20)"
            color="#93c5fd"
          >
            <Pencil size={13} />
          </IconButton>

          <IconButton
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Expand" : "Collapse"}
            tint="rgba(167,139,250,0.10)"
            border="rgba(167,139,250,0.20)"
            color="#c4b5fd"
          >
            <ChevronDown
              size={14}
              style={{ transition: "transform 0.2s ease", transform: collapsed ? "none" : "rotate(180deg)" }}
            />
          </IconButton>

          <IconButton
            onClick={() => onDelete(budget.id, budget.category)}
            title="Delete budget"
            tint="rgba(248,113,113,0.10)"
            border="rgba(248,113,113,0.20)"
            color="#fca5a5"
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>

      {/* Bar stays visible when collapsed — it is the one thing worth seeing at a glance */}
      <div
        style={{
          height: 6, borderRadius: 6, overflow: "hidden", marginTop: 14,
          background: "var(--bg-subtle)",
        }}
      >
        <div
          style={{
            height: "100%", width: `${barWidth}%`, background: color,
            borderRadius: 6, transition: "width 0.6s ease",
          }}
        />
      </div>

      {!collapsed && editing && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
          <input
            type="number"
            autoFocus
            value={newLimit}
            onChange={(e) => setNewLimit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveLimit();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder="Monthly limit (₹)"
            className="goal-input"
            style={{ padding: "8px 12px" }}
          />
          <IconButton
            onClick={saving ? () => {} : saveLimit}
            title="Save limit"
            tint="rgba(74,222,128,0.10)"
            border="rgba(74,222,128,0.20)"
            color="#4ade80"
          >
            <Check size={14} />
          </IconButton>
          <IconButton
            onClick={() => setEditing(false)}
            title="Cancel"
            tint="var(--bg-subtle)"
            border="var(--border-card)"
            color="var(--text-dim)"
          >
            <X size={14} />
          </IconButton>
        </div>
      )}

      {!collapsed && !editing && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginTop: 12 }}>
            <div>
              <span style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>
                {rupees(budget.spent)}
              </span>
              <span style={{ fontSize: 13, color: "var(--text-dim)" }}> / {rupees(budget.limit)}</span>
              <div style={{ fontSize: 10.5, color: "var(--text-dim)", marginTop: 2 }}>spent this month</div>
            </div>

            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: remaining >= 0 ? "#4ade80" : "#f87171" }}>
                {rupees(Math.abs(remaining))}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--text-dim)", marginTop: 2 }}>
                {remaining >= 0 ? "left" : "over"}
              </div>
            </div>
          </div>

          {/* One line, not a paragraph — the numbers above already say how much */}
          {pct >= 70 && (
            <div
              style={{
                display: "flex", alignItems: "center", gap: 7, marginTop: 12,
                padding: "8px 10px", borderRadius: 10, fontSize: 11.5, lineHeight: 1.4,
                background: `${color}1a`, border: `1px solid ${color}40`, color,
              }}
            >
              <AlertTriangle size={13} style={{ flexShrink: 0 }} />
              <span>
                {remaining >= 0
                  ? `Only ${rupees(remaining)} left with the month still running.`
                  : `You are ${rupees(Math.abs(remaining))} past this budget.`}
              </span>
            </div>
          )}
        </>
      )}
    </GlassCard>
  );
}

function IconButton({ onClick, title, tint, border, color, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center",
        justifyContent: "center", cursor: "pointer", color,
        background: tint, border: `1px solid ${border}`, transition: "filter 0.2s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.4)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}
    >
      {children}
    </button>
  );
}

export default BudgetCard;
