// One place for budget thresholds. The card used to colour its bar at 90/70,
// label its warning box at 80, and take "exceeded" from the backend — three
// different ideas of "in trouble" on the same card.
export const BUDGET_SAFE = "#4ade80";
export const BUDGET_WATCH = "#fbbf24";
export const BUDGET_OVER = "#f87171";

export function budgetPercent(budget) {
  const limit = budget.limit || 0;
  if (limit <= 0) return 0;
  return ((budget.spent || 0) / limit) * 100;
}

/**
 * Uncapped percent decides the label; the bar caps its own width at 100.
 * "Over" means strictly past the limit (pct > 100), matching the backend's
 * exceeded = spent > limit — at exactly 100% you have ₹0 left, not overspent.
 */
export function budgetStatus(budget) {
  const pct = budgetPercent(budget);
  if (budget.exceeded || pct > 100) {
    return { key: "over", label: "Over budget", color: BUDGET_OVER, pct };
  }
  if (pct >= 70) {
    return { key: "watch", label: "Watch", color: BUDGET_WATCH, pct };
  }
  return { key: "safe", label: "On track", color: BUDGET_SAFE, pct };
}

/**
 * Most urgent first: over budget, then closest to the limit. Ties break by id
 * (creation order) — the API's row order changes between fetches, and without
 * a fixed tiebreak equal-percentage cards swapped positions after every save,
 * so the card under the cursor silently became a different budget.
 */
export function sortByUrgency(budgets) {
  return [...budgets].sort((a, b) => {
    const byPct = budgetPercent(b) - budgetPercent(a);
    return byPct !== 0 ? byPct : (a.id || 0) - (b.id || 0);
  });
}
