import { describe, it, expect } from "vitest";
import { budgetStatus, sortByUrgency, startsLabel } from "./budgetStatus";

describe("budgetStatus", () => {
  it("a budget that starts next month isn't over budget yet", () => {
    const s = budgetStatus({ limit: 9000, spent: 10700, exceeded: false, startsOn: "2026-12-01" });
    expect(s.key).toBe("upcoming");
    expect(s.label).toBe(`Starts ${startsLabel("2026-12-01")}`);
  });

  it("rent paid in full is paid, not a warning", () => {
    expect(budgetStatus({ limit: 17500, spent: 17500, fixedCost: true }).key).toBe("paid");
    // everyday spending at the limit still warns
    expect(budgetStatus({ limit: 9000, spent: 9000 }).key).toBe("watch");
    // a fixed cost over its limit is still over
    expect(budgetStatus({ limit: 4000, spent: 4500, exceeded: true, fixedCost: true }).key).toBe("over");
  });

  it("budgets that haven't started sort last", () => {
    const sorted = sortByUrgency([
      { id: 1, limit: 100, spent: 500, startsOn: "2026-12-01" },
      { id: 2, limit: 100, spent: 10 },
    ]);
    expect(sorted.map((b) => b.id)).toEqual([2, 1]);
  });
});
