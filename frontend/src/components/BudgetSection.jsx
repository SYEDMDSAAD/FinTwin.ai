import { Wallet } from "lucide-react";
import BudgetCard from "./BudgetCard";
import BudgetModal from "./BudgetModal";
import PlanDraftCard from "./PlanDraftCard";
import { Progress, EmptyState } from "./ui";
import { budgetStatus, sortByUrgency } from "../constants/budgetStatus";
import { rupees } from "../utils/money";

/* Budgets: how much of this month's limits is used, then each budget, trouble first. */

function BudgetSection({ budgets, createBudget, deleteBudget, updateBudget, onPlanApplied }) {
  // Budgets that start next month don't count towards this month's picture
  const live = budgets.filter((b) => !b.startsOn);
  const totalLimit = live.reduce((s, b) => s + (b.limit || 0), 0);
  const totalSpent = live.reduce((s, b) => s + (b.spent || 0), 0);
  const remaining = totalLimit - totalSpent;
  const overallPct = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;

  const overCount = budgets.filter((b) => budgetStatus(b).key === "over").length;
  const watchCount = budgets.filter((b) => budgetStatus(b).key === "watch").length;
  const barTone = overallPct > 100 ? "bad" : overallPct >= 70 ? "warn" : "accent";

  const ordered = sortByUrgency(budgets);

  return (
    <div className="max-w-2xl mb-10">
      <PlanDraftCard hasBudgets={budgets.length > 0} onApplied={onPlanApplied} />

      {live.length > 0 && (
        <section aria-label="This month's budgets" className="px-1 mb-8">
          <p className="text-small text-ink-3">{remaining >= 0 ? "Left in your budgets" : "Over your budgets"}</p>
          <p className={`text-hero num mt-1 ${remaining < 0 ? "text-bad" : "text-ink"}`}>{rupees(Math.abs(remaining))}</p>
          <p className="mt-2 text-body text-ink-2">
            <span className="num">{rupees(totalSpent)}</span> spent of <span className="num">{rupees(totalLimit)}</span>
            {(overCount > 0 || watchCount > 0) && (
              <>
                {" · "}
                {overCount > 0 && <span className="text-bad font-medium">{overCount} over</span>}
                {overCount > 0 && watchCount > 0 && ", "}
                {watchCount > 0 && <span className="text-warn font-medium">{watchCount} close to the limit</span>}
              </>
            )}
          </p>
          <Progress className="mt-5" value={overallPct} tone={barTone} label="Share of this month's budgets used" />
        </section>
      )}

      <BudgetModal createBudget={createBudget} existingCategories={budgets.map((b) => b.category)} />

      {budgets.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No budgets yet"
          body="Set a monthly limit for a category and FinTwin tracks it against your real spending, with a warning before you cross it."
        />
      ) : (
        <ul aria-label="Budgets" className="rounded-card bg-surface border border-line divide-y divide-line">
          {ordered.map((budget) => (
            <BudgetCard key={budget.id} budget={budget} onDelete={deleteBudget} onUpdate={updateBudget} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default BudgetSection;
