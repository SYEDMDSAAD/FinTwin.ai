// Single source of truth for the AI advisor personalities, shared by
// onboarding, settings and the Copilot chat so the copy can't drift apart.
export const AI_MODES = [
  { id: "Savings Advisor",    icon: "🐷", desc: "Optimise your savings rate and build an emergency fund" },
  { id: "Investment Advisor", icon: "📈", desc: "Grow wealth through smart investment recommendations" },
  { id: "Budget Coach",       icon: "📊", desc: "Stay on track with personalised budget management" },
  { id: "Fraud Analyst",      icon: "🔍", desc: "Detect suspicious patterns and protect your finances" },
  { id: "Purchase Advisor",   icon: "🛒", desc: "Analyse affordability before any major purchase" },
];

export const AI_MODE_IDS = AI_MODES.map(m => m.id);
