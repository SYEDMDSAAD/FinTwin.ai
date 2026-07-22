import BudgetCard from "./BudgetCard";
import BudgetModal from "./BudgetModal";
import GlassCard from "./GlassCard";
import { PieChart, Wallet } from "lucide-react";
import { budgetStatus, sortByUrgency, BUDGET_SAFE, BUDGET_WATCH, BUDGET_OVER } from "../constants/budgetStatus";

const rupees = (v) => `₹${Math.round(v || 0).toLocaleString("en-IN")}`;

function BudgetSection({ budgets, createBudget, deleteBudget, updateBudget }) {
  const totalLimit = budgets.reduce((s, b) => s + (b.limit || 0), 0);
  const totalSpent = budgets.reduce((s, b) => s + (b.spent || 0), 0);
  const remaining = totalLimit - totalSpent;
  const overallPct = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;

  const overCount = budgets.filter((b) => budgetStatus(b).key === "over").length;
  const watchCount = budgets.filter((b) => budgetStatus(b).key === "watch").length;

  const overallColor =
    overallPct >= 100 ? BUDGET_OVER : overallPct >= 70 ? BUDGET_WATCH : BUDGET_SAFE;

  // Trouble first — a budget already blown matters more than one at 12%.
  const ordered = sortByUrgency(budgets);

  return (
    <div className="mb-10">
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div
          style={{
            width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center",
            justifyContent: "center", background: "rgba(167,139,250,0.10)",
            border: "1px solid rgba(167,139,250,0.20)", flexShrink: 0,
          }}
        >
          <PieChart size={18} color="#c4b5fd" />
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", color: "var(--text-dim)" }}>
            BUDGETING
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", margin: 0, lineHeight: 1.3 }}>
            Budget Manager
          </h2>
        </div>

        {budgets.length > 0 && (
          <span
            style={{
              marginLeft: "auto", flexShrink: 0, fontSize: 11, fontWeight: 700,
              padding: "5px 10px", borderRadius: 999, color: "var(--text-dim)",
              background: "var(--bg-subtle)", border: "1px solid var(--border-card)",
            }}
          >
            {budgets.length} {budgets.length === 1 ? "budget" : "budgets"}
          </span>
        )}
      </div>

      {/* Roll-up — leads the section so the overall picture reads before the detail */}
      {budgets.length > 0 && (
        <GlassCard className="relative overflow-hidden p-5 mb-6">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <span style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)" }}>
                {rupees(totalSpent)}
              </span>
              <span style={{ fontSize: 14, color: "var(--text-dim)" }}> of {rupees(totalLimit)}</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: overallColor }}>
              {overallPct.toFixed(0)}% used
            </span>
          </div>

          <div style={{ height: 8, borderRadius: 8, overflow: "hidden", marginTop: 12, background: "var(--bg-subtle)" }}>
            <div
              style={{
                height: "100%", width: `${Math.min(overallPct, 100)}%`, background: overallColor,
                borderRadius: 8, transition: "width 0.6s ease",
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 16 }}>
            <StatTile label="Total limit" value={rupees(totalLimit)} />
            <StatTile label="Spent" value={rupees(totalSpent)} color="#f87171" />
            <StatTile
              label={remaining >= 0 ? "Remaining" : "Overspent"}
              value={rupees(Math.abs(remaining))}
              color={remaining >= 0 ? "#4ade80" : "#f87171"}
            />
          </div>

          {(overCount > 0 || watchCount > 0) && (
            <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 12 }}>
              {overCount > 0 && (
                <span style={{ color: BUDGET_OVER, fontWeight: 600 }}>
                  {overCount} over budget
                </span>
              )}
              {overCount > 0 && watchCount > 0 && " · "}
              {watchCount > 0 && (
                <span style={{ color: BUDGET_WATCH, fontWeight: 600 }}>
                  {watchCount} near the limit
                </span>
              )}
            </div>
          )}
        </GlassCard>
      )}

      <BudgetModal createBudget={createBudget} existingCategories={budgets.map((b) => b.category)} />

      {budgets.length === 0 ? (
        <GlassCard className="p-8" >
          <div style={{ textAlign: "center", maxWidth: 380, margin: "0 auto" }}>
            <div
              style={{
                width: 44, height: 44, borderRadius: 14, margin: "0 auto 12px", display: "flex",
                alignItems: "center", justifyContent: "center",
                background: "rgba(167,139,250,0.10)", border: "1px solid rgba(167,139,250,0.20)",
              }}
            >
              <Wallet size={20} color="#c4b5fd" />
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
              No budgets yet
            </h3>
            <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 6, lineHeight: 1.6 }}>
              Set a monthly limit on a spending category and this section tracks it against your
              real transactions — with a warning before you cross it, not after.
            </p>
          </div>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {ordered.map((budget) => (
            <BudgetCard key={budget.id} budget={budget} onDelete={deleteBudget} onUpdate={updateBudget} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, color }) {
  return (
    <div
      style={{
        borderRadius: 12, padding: "10px 12px",
        background: "var(--bg-subtle)", border: "1px solid var(--border-card)",
      }}
    >
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-dim)", textTransform: "uppercase" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 15, fontWeight: 800, marginTop: 3, color: color || "var(--text-primary)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default BudgetSection;
