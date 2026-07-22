import { useState } from "react";
import { toast } from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import GlassCard from "./GlassCard";
import AnimatedDots from "./AnimatedDots";
import CategoryDropdown from "./CategoryDropdown";
import { Plus, ChevronDown, Sparkles, ArrowLeft } from "lucide-react";
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
  const [open, setOpen] = useState(true);

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
    // No overflow-hidden: it clipped the category dropdown to the card edge.
    // The accent line fades to transparent at both ends, so it needs no clip.
    // z-20: GlassCard's backdrop-filter makes each card its own stacking
    // context, so the dropdown's own z-index cannot lift it above the budget
    // cards that follow in the DOM — this whole card has to outrank them.
    <GlassCard className="relative z-20 p-5 mb-6">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", background: "none", border: "none", padding: 0,
          cursor: "pointer", fontFamily: "inherit", textAlign: "left",
          marginBottom: open ? 14 : 0,
        }}
      >
        {open ? (
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.1em" }}>
            CREATE BUDGET
          </span>
        ) : (
          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>Create Budget</span>
        )}
        <ChevronDown
          size={17}
          style={{
            color: "var(--text-primary)", flexShrink: 0,
            transition: "transform 0.2s ease", transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </button>

      {open && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
            {/* Category */}
            <div>
              {custom ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Custom category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="goal-input"
                  />
                  <button
                    type="button"
                    onClick={() => { setCustom(false); setCategory(""); }}
                    title="Back to category list"
                    aria-label="Back to category list"
                    style={{
                      flexShrink: 0, width: 34, height: 34, borderRadius: 9, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "var(--bg-subtle)", border: "1px solid var(--border-card)",
                      color: "var(--text-dim)",
                    }}
                  >
                    <ArrowLeft size={14} />
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
            </div>

            {/* Amount */}
            <input
              type="number"
              placeholder="Monthly limit (₹)"
              value={limitAmount}
              onChange={(e) => setLimitAmount(e.target.value)}
              className="goal-input"
            />

            {/* Submit */}
            <button
              disabled={creatingBudget || !canCreate}
              onClick={handleCreateBudget}
              style={{
                position: "relative", overflow: "hidden",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                borderRadius: 12, fontWeight: 600, fontSize: 13, padding: "12px 16px",
                border: "none", cursor: creatingBudget ? "not-allowed" : canCreate ? "pointer" : "not-allowed",
                background: canCreate && !creatingBudget ? "linear-gradient(135deg, #a78bfa, #7c3aed)" : "var(--bg-subtle)",
                color: canCreate && !creatingBudget ? "#fff" : "var(--text-dim)",
                transition: "opacity 0.2s",
              }}
            >
              <AnimatePresence mode="wait">
                {creatingBudget ? (
                  <motion.span
                    key="creating"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                      style={{ display: "flex" }}
                    >
                      <Sparkles size={14} />
                    </motion.span>
                    <span>Creating<AnimatedDots /></span>
                  </motion.span>
                ) : (
                  <motion.span
                    key="idle"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <Plus size={15} />
                    Create Budget
                  </motion.span>
                )}
              </AnimatePresence>

              {creatingBudget && (
                <motion.span
                  style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)" }}
                  animate={{ x: ["-100%", "100%"] }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                />
              )}
            </button>
          </div>

          {duplicate && (
            <p style={{ fontSize: 11.5, color: "#fbbf24", marginTop: 10 }}>
              You already have a budget for {trimmed} — edit its limit on the card below instead.
            </p>
          )}
        </>
      )}
    </GlassCard>
  );
}

export default BudgetModal;
