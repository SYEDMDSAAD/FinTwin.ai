import { useState } from "react";
import { toast } from "react-hot-toast";
import CategoryDropdown from "./CategoryDropdown";
import { Plus, ChevronDown, ArrowLeft } from "lucide-react";
import { Button } from "./ui";
import { EDIT_CATEGORIES } from "../constants/categories";

// Budgets cap spending, so the income-side categories are not offered.
const BUDGET_CATEGORIES = EDIT_CATEGORIES.filter(
  (c) => c !== "Income" && c !== "Transfer"
);

function BudgetModal({ createBudget, existingCategories = [] }) {
  const [category, setCategory] = useState("");
  const [custom, setCustom] = useState(false);
  const [limitAmount, setLimitAmount] = useState("");
  const [creatingBudget, setCreatingBudget] = useState(false);
  const [open, setOpen] = useState(existingCategories.length === 0);

  const trimmed = category.trim();

  // Spending is categorised by the backend using these exact names, so a
  // free-typed "food" never matches the "Food" transactions and the budget
  // sits at 0% forever. Same-name budgets are caught here rather than
  // producing two cards splitting one category's spend.
  const duplicate = existingCategories.some(
    (c) => c.toLowerCase() === trimmed.toLowerCase()
  );

  const canCreate = trimmed && limitAmount && Number(limitAmount) > 0 && !duplicate;

  const handleCreateBudget = async () => {
    if (!trimmed || !limitAmount || Number(limitAmount) <= 0) {
      toast.error("Please pick a category and enter a budget amount.");
      return;
    }
    if (duplicate) {
      toast.error(`A budget for ${trimmed} already exists.`);
      return;
    }

    setCreatingBudget(true);
    try {
      await createBudget({ category: trimmed, limitAmount: Number(limitAmount) });
      setCategory("");
      setLimitAmount("");
      setCustom(false);
    } finally {
      setCreatingBudget(false);
    }
  };

  return (
    // No overflow-hidden: it would clip the category dropdown to the card edge
    <div className="relative z-20 mb-6 rounded-card bg-surface border border-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="shrink-0 w-10 h-10 rounded-full bg-accent-soft text-accent flex items-center justify-center"><Plus size={18} aria-hidden /></span>
        <span className="flex-1 text-body font-medium text-ink">New budget</span>
        <ChevronDown size={18} aria-hidden className={`shrink-0 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {custom ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                autoFocus
                placeholder="Custom category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={INPUT}
              />
              <button
                type="button"
                onClick={() => { setCustom(false); setCategory(""); }}
                aria-label="Back to category list"
                className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-ink-2 hover:bg-surface-sunken"
              >
                <ArrowLeft size={16} aria-hidden />
              </button>
            </div>
          ) : (
            <CategoryDropdown
              value={category || "Select category"}
              options={BUDGET_CATEGORIES}
              onSelect={setCategory}
              onCustomClick={() => { setCustom(true); setCategory(""); }}
            />
          )}

          <div className="flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              placeholder="Monthly limit (₹)"
              aria-label="Monthly limit"
              value={limitAmount}
              onChange={(e) => setLimitAmount(e.target.value)}
              className={INPUT}
            />
            <Button onClick={handleCreateBudget} disabled={creatingBudget || !canCreate} className="shrink-0">
              {creatingBudget ? "Creating…" : "Create"}
            </Button>
          </div>

          {duplicate && (
            <p className="text-small text-warn">
              You already have a budget for {trimmed}. Change its limit in the list below instead.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const INPUT = "flex-1 min-w-0 w-full h-11 rounded-control bg-surface-sunken border border-transparent px-3 text-body text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent";

export default BudgetModal;
