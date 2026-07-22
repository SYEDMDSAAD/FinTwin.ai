import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AIPlanCard, { parsePlan } from "./AIPlanCard";

const STRUCTURED = `You are ₹7,000 a month short of the ₹25,000 this goal needs.

### Do this now
- Cut 15% from Food & Dining to free ₹2,400 a month.
- Or keep saving ₹18,000 a month and move the deadline to 17 months.

### Milestones
- Month 3 — ₹75,000 saved (25%)
- Month 12 — ₹3,00,000 saved (100%)

### Biggest risk
- The most likely failure is treating the ₹7,000 gap as something next month will fix.`;

describe("parsePlan", () => {
  it("splits the headline from the sections", () => {
    const parsed = parsePlan(STRUCTURED);
    expect(parsed.headline).toBe(
      "You are ₹7,000 a month short of the ₹25,000 this goal needs."
    );
    expect(parsed.sections.map(s => s.title)).toEqual([
      "Do this now", "Milestones", "Biggest risk",
    ]);
    expect(parsed.sections[0].items).toHaveLength(2);
  });

  // Goals created before the structured planner still hold a single
  // paragraph; parsing must decline so the card falls back to markdown
  // instead of rendering an empty shell.
  it("declines plans that have no sections", () => {
    expect(parsePlan("Save ₹25,000 per month to reach your goal.")).toBeNull();
    expect(parsePlan("")).toBeNull();
    expect(parsePlan(null)).toBeNull();
  });
});

describe("AIPlanCard", () => {
  it("shows the headline and the first section, collapsing the rest", () => {
    render(<AIPlanCard plan={STRUCTURED} />);
    expect(screen.getByText(/₹7,000 a month short/)).toBeInTheDocument();
    expect(screen.getByText("Do this now")).toBeInTheDocument();
    expect(screen.queryByText("Milestones")).not.toBeInTheDocument();
    expect(screen.getByText(/2 more sections/)).toBeInTheDocument();
  });

  it("reveals every section once expanded", async () => {
    render(<AIPlanCard plan={STRUCTURED} />);
    await userEvent.click(screen.getByText(/2 more sections/));
    expect(screen.getByText("Milestones")).toBeInTheDocument();
    expect(screen.getByText("Biggest risk")).toBeInTheDocument();
    expect(screen.getByText("Month 3")).toBeInTheDocument();
    expect(screen.getByText("₹75,000")).toBeInTheDocument();
  });

  it("renders bold figures without leaking asterisks", async () => {
    render(<AIPlanCard plan={`Headline.

### Where the money comes from
- **Food & Dining** — trimming 15% frees **₹2,400/mo**.`} />);
    expect(screen.getByText("Food & Dining")).toBeInTheDocument();
    expect(screen.getByText("₹2,400/mo")).toBeInTheDocument();
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it("falls back to markdown for legacy single-paragraph plans", () => {
    render(<AIPlanCard plan="Save ₹25,000 per month to reach your goal." />);
    expect(
      screen.getByText("Save ₹25,000 per month to reach your goal.")
    ).toBeInTheDocument();
  });

  it("prompts a regenerate when the goal has no plan at all", () => {
    render(<AIPlanCard plan={null} />);
    expect(screen.getByText(/No plan generated yet/)).toBeInTheDocument();
  });
});
