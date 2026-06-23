import { useState } from "react";
import { CheckCircle, Circle, X } from "lucide-react";

const STEPS = [
  { key: "account",     label: "Create your account" },
  { key: "transaction", label: "Add your first transaction" },
  { key: "budget",      label: "Set a budget" },
  { key: "goal",        label: "Create a financial goal" },
  { key: "bank",        label: "Connect a bank account" },
];

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

  const done = Object.values(checks).filter(Boolean).length;
  const total = STEPS.length;
  const pct = Math.round((done / total) * 100);

  const dismiss = () => {
    localStorage.setItem("fintwin-checklist-dismissed", "true");
    setDismissed(true);
  };

  return (
    <div style={{
      position: "relative", overflow: "hidden",
      background: "rgba(167,139,250,0.05)",
      border: "1px solid rgba(167,139,250,0.2)",
      borderRadius: 18, padding: "20px 24px",
      marginBottom: 24,
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      {/* Top shimmer */}
      <div style={{ position: "absolute", inset: "0 0 auto", height: 1, background: "linear-gradient(90deg, transparent, rgba(167,139,250,0.5), transparent)" }} />

      {/* Dismiss */}
      <button
        onClick={dismiss}
        style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 4 }}
      >
        <X size={15} />
      </button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 22 }}>🚀</div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(167,139,250,0.7)", letterSpacing: "0.12em", marginBottom: 2 }}>GETTING STARTED</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Set up your FinTwin AI</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#a78bfa" }}>{pct}%</div>
          <div style={{ fontSize: 10, color: "rgba(148,163,184,0.5)" }}>Complete</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 4, marginBottom: 16, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, #a78bfa, #22d3ee)", borderRadius: 4, transition: "width 0.6s ease" }} />
      </div>

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {STEPS.map((step) => {
          const done = checks[step.key];
          return (
            <div key={step.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {done
                ? <CheckCircle size={16} color="#4ade80" />
                : <Circle size={16} color="rgba(148,163,184,0.3)" />
              }
              <span style={{
                fontSize: 13, fontWeight: 500,
                color: done ? "#4ade80" : "rgba(148,163,184,0.7)",
                textDecoration: done ? "line-through" : "none",
              }}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {pct === 100 && (
        <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 10, fontSize: 12, color: "#4ade80", fontWeight: 600 }}>
          All done! Your FinTwin AI is fully set up.
        </div>
      )}
    </div>
  );
}
