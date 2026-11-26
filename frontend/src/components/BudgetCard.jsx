import { useState } from "react";
import { Trash2, Pencil, ChevronDown } from "lucide-react";
import { Progress, Badge, Button, cx } from "./ui";
import { budgetStatus, BUDGET_TONE } from "../constants/budgetStatus";
import { rupees } from "../utils/money";

/* One budget as a list row: name, what's left, a bar. Tap it for edit and delete. */

function BudgetCard({ budget, onDelete, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newLimit, setNewLimit] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setNewLimit(String(budget.limit ?? ""));
    setEditing(true);
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

  const { key, label, pct } = budgetStatus(budget);
  const tone = BUDGET_TONE[key] || "neutral";
  const upcoming = key === "upcoming";
  const remaining = budget.remaining ?? (budget.limit || 0) - (budget.spent || 0);
  const barTone = key === "over" ? "bad" : key === "watch" ? "warn" : key === "paid" ? "good" : "accent";
  const showBadge = key !== "safe";

  return (
    <li className="px-4 py-3.5">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
              className="w-full text-left" aria-label={`${budget.category}, ${label}`}>
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 truncate text-body font-medium text-ink" title={budget.category}>{budget.category}</h3>
          {showBadge && <Badge tone={tone}>{label}</Badge>}
          <span className={cx("ml-auto shrink-0 text-body font-semibold num", remaining < 0 && !upcoming ? "text-bad" : "text-ink")}>
            {upcoming ? rupees(budget.limit) : rupees(Math.abs(remaining))}
          </span>
          <ChevronDown size={16} aria-hidden className={cx("shrink-0 text-ink-3 transition-transform", open && "rotate-180")} />
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-small text-ink-3">
          <span className="num">{upcoming ? "Monthly limit" : `${rupees(budget.spent)} of ${rupees(budget.limit)}`}</span>
          <span className="mr-6">{upcoming ? "" : remaining >= 0 ? "left" : "over"}</span>
        </div>
        {!upcoming && <Progress className="mt-2.5" value={pct} tone={barTone} label={`${budget.category} used`} />}
      </button>

      {open && (
        <div className="mt-3">
          {upcoming && (
            <p className="mb-3 text-small text-ink-3">
              Set up late this month, so it counts from {label.replace("Starts ", "")}. Spending before then isn't counted.
            </p>
          )}
          {!upcoming && key === "watch" && (
            <p className="mb-3 text-small text-ink-2">Only {rupees(remaining)} left with the month still running.</p>
          )}
          {editing ? (
            <div className="flex items-center gap-2">
              <span className="text-ink-3">₹</span>
              <input
                type="number"
                inputMode="numeric"
                autoFocus
                value={newLimit}
                onChange={(e) => setNewLimit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveLimit();
                  if (e.key === "Escape") setEditing(false);
                }}
                aria-label="Monthly limit"
                className="flex-1 min-w-0 h-10 rounded-control bg-surface-sunken border border-transparent px-3 text-body text-ink num focus:outline-none focus:border-accent"
              />
              <Button size="sm" onClick={saveLimit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" icon={Pencil} onClick={startEdit}>Edit limit</Button>
              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => onDelete(budget.id, budget.category)}
                      className="text-bad" aria-label="Delete budget">Delete</Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default BudgetCard;
