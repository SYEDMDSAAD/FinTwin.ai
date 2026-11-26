import { useState } from "react";
import { CheckCircle, Circle, X } from "lucide-react";
import { BANK_LINK_ENABLED } from "../utils/bankLink";

const STEPS = [
  { key: "account",     label: "Create your account" },
  { key: "transaction", label: "Add your first transaction" },
  { key: "budget",      label: "Set a budget" },
  { key: "goal",        label: "Create a financial goal" },
  { key: "bank",        label: "Connect a bank account" },
].filter(s => s.key !== "bank" || BANK_LINK_ENABLED);

export default function OnboardingChecklist({ transactions = [], budgets = [], goals = [], bankConnected = false }) {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem("fintwin-checklist-dismissed") === "true"
  );

  if (dismissed) return null;

  const userData = JSON.parse(localStorage.getItem("user") || "{}");
  const createdAt = userData.createdAt ? new Date(userData.createdAt) : null;
  const isNewUser = !createdAt || (Date.now() - createdAt.getTime() < 7 * 24 * 60 * 60 * 1000);
  if (!isNewUser) return null;

  const checks = {
    account:     true,
    transaction: transactions.length > 0,
    budget:      budgets.length > 0,
    goal:        goals.length > 0,
    bank:        bankConnected,
  };

  const done = STEPS.filter(s => checks[s.key]).length;
  const total = STEPS.length;
  const pct = Math.round((done / total) * 100);

  const dismiss = () => {
    localStorage.setItem("fintwin-checklist-dismissed", "true");
    setDismissed(true);
  };

  return (
    <div style={{
      position: "relative", overflow: "hidden",
      background: "var(--accent-soft)",
      border: "none",
      borderRadius: 18, padding: "20px 24px",
      marginBottom: 24,
      }}>
      {/* Top shimmer */}

      {/* Dismiss */}
      <button
        onClick={dismiss}
        style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 4 }}
      >
        <X size={15} />
      </button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 2 }}>Getting started</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Set up your FinTwin AI</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 650, color: "var(--accent)" }}>{pct}%</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Complete</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: "var(--bg-input)", borderRadius: 4, marginBottom: 16, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, var(--accent), var(--info))", borderRadius: 4, transition: "width 0.6s ease" }} />
      </div>

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {STEPS.map((step) => {
          const done = checks[step.key];
          return (
            <div key={step.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {done
                ? <CheckCircle size={16} color="var(--good)" />
                : <Circle size={16} color="var(--text-dim)" />
              }
              <span style={{
                fontSize: 13, fontWeight: 500,
                color: done ? "var(--good)" : "var(--text-dim)",
                textDecoration: done ? "line-through" : "none",
              }}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {pct === 100 && (
        <div style={{ marginTop: 14, padding: "10px 14px", background: "var(--good-soft)", border: "1px solid var(--good-soft)", borderRadius: 10, fontSize: 12, color: "var(--good)", fontWeight: 600 }}>
          All done! Your FinTwin AI is fully set up.
        </div>
      )}
    </div>
  );
}
