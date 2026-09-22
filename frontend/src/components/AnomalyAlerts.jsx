import { useState } from "react";
import GlassCard from "./GlassCard";
import { AlertTriangle, ShieldCheck, TrendingUp, Zap, BarChart2, Calendar, ThumbsDown, ThumbsUp, Check } from "lucide-react";
import API from "../services/api";
import toast from "react-hot-toast";

const SEVERITY = {
  high:   { color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.22)", label: "High Risk" },
  medium: { color: "#fbbf24", bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.22)",  label: "Medium Risk" },
  low:    { color: "#22d3ee", bg: "rgba(34,211,238,0.08)",  border: "rgba(34,211,238,0.22)",  label: "Low Risk" },
};

const TYPE_META = {
  merchant_spike:    { icon: <TrendingUp size={14} />,  label: "Merchant Spike" },
  category_spike:    { icon: <BarChart2 size={14} />,   label: "Category Surge" },
  category_surge:    { icon: <BarChart2 size={14} />,   label: "Category Surge" },
  large_single:      { icon: <Zap size={14} />,          label: "Large Transaction" },
  large_transaction: { icon: <Zap size={14} />,          label: "Large Transaction" },
  burst:             { icon: <Calendar size={14} />,     label: "Spending Burst" },
};

// What the backend records with a verdict: the figures that raised the alert,
// so false alarms can be measured per kind of alert.
const verdictBody = (a) => ({
  type: a.type, merchant: a.merchant, category: a.category,
  amount: a.amount, avgAmount: a.avgAmount, multiplier: a.multiplier, severity: a.severity,
});

function AnomalyCard({ anomaly, onDismiss }) {
  const [dismissing, setDismissing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const sev  = SEVERITY[anomaly.severity] || SEVERITY.low;
  const meta = TYPE_META[anomaly.type] || TYPE_META[anomaly.anomaly_type] || { icon: <AlertTriangle size={14} />, label: "Anomaly" };

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      await API.post("/anomalies/dismiss", verdictBody(anomaly));
      toast.success("Marked as not an anomaly");
      onDismiss(anomaly);
    } catch {
      toast.error("Failed to dismiss");
      setDismissing(false);
    }
  };

  // "Yes, that was odd": the alert was right. It stays on screen.
  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await API.post("/anomalies/confirm", verdictBody(anomaly));
      setConfirmed(true);
      toast.success("Thanks — worth checking that charge");
    } catch {
      toast.error("Couldn't save that. Try again.");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div style={{
      position: "relative", overflow: "hidden", borderRadius: 16,
      background: sev.bg, border: `1px solid ${sev.border}`,
      padding: "20px 22px", transition: "transform 0.2s",
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}
    onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
    onMouseLeave={e => e.currentTarget.style.transform = ""}>

      {/* Top row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: sev.color, background: sev.bg,
              border: `1px solid ${sev.border}`, borderRadius: 6, padding: "2px 8px",
              display: "inline-flex", alignItems: "center", gap: 4 }}>
              {meta.icon} {meta.label}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: sev.color, background: sev.color + "18",
              border: `1px solid ${sev.color}30`, borderRadius: 6, padding: "2px 8px" }}>
              {sev.label}
            </span>
          </div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: 0,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {anomaly.merchant}
          </h3>
          {anomaly.category && anomaly.category !== "Multiple" && (
            <div style={{ fontSize: 11, color: "rgba(148,163,184,0.55)", marginTop: 2 }}>
              {anomaly.category}
            </div>
          )}
        </div>

        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: sev.color, letterSpacing: "-0.02em",
            fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
            ₹{Math.round(anomaly.amount)?.toLocaleString("en-IN")}
          </div>
          {anomaly.multiplier && (
            <div style={{ fontSize: 11, color: sev.color + "bb", marginTop: 3, fontWeight: 700 }}>
              {anomaly.multiplier?.toFixed(1)}x usual
            </div>
          )}
          {anomaly.avgAmount != null && (
            <div style={{ fontSize: 10, color: "rgba(148,163,184,0.45)", marginTop: 1 }}>
              avg ₹{Math.round(anomaly.avgAmount)?.toLocaleString("en-IN")}
            </div>
          )}
        </div>
      </div>

      {/* Reason */}
      {(anomaly.reason) && (
        <div style={{ background: "rgba(0,0,0,0.15)", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.45)",
            letterSpacing: "0.08em", marginBottom: 4 }}>WHAT HAPPENED</div>
          <p style={{ fontSize: 12, color: "#d1d5db", lineHeight: 1.6, margin: 0 }}>
            {anomaly.reason}
          </p>
        </div>
      )}

      {/* Action */}
      {(anomaly.action) && (
        <div style={{ background: sev.color + "0d", border: `1px solid ${sev.color}25`,
          borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: sev.color + "99",
            letterSpacing: "0.08em", marginBottom: 4 }}>WHAT TO DO</div>
          <p style={{ fontSize: 12, color: "#d1d5db", lineHeight: 1.6, margin: 0 }}>
            {anomaly.action}
          </p>
        </div>
      )}

      {/* Verdict buttons */}
      <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
        {confirmed ? (
          <span role="status" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: sev.color }}>
            <Check size={12} aria-hidden /> You marked this as unusual
          </span>
        ) : (
          <button
            onClick={handleConfirm}
            disabled={confirming || dismissing}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "5px 12px", borderRadius: 8, cursor: "pointer",
              background: sev.color + "14", border: `1px solid ${sev.color}40`,
              color: sev.color, fontSize: 11, fontWeight: 600, fontFamily: "inherit",
              opacity: confirming ? 0.5 : 1,
            }}
          >
            <ThumbsUp size={11} />
            {confirming ? "Saving…" : "Yes, that was odd"}
          </button>
        )}
        <button
          onClick={handleDismiss}
          disabled={dismissing}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "5px 12px", borderRadius: 8, cursor: "pointer",
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(148,163,184,0.6)", fontSize: 11, fontWeight: 600, fontFamily: "inherit",
            transition: "all 0.15s", opacity: dismissing ? 0.5 : 1,
          }}
          onMouseEnter={e => { if (!dismissing) { e.currentTarget.style.color="#e2e8f0"; e.currentTarget.style.background="rgba(255,255,255,0.08)"; }}}
          onMouseLeave={e => { e.currentTarget.style.color="rgba(148,163,184,0.6)"; e.currentTarget.style.background="rgba(255,255,255,0.04)"; }}
        >
          <ThumbsDown size={11} />
          {dismissing ? "Dismissing…" : "Not an anomaly"}
        </button>
      </div>
    </div>
  );
}

// What a dismissal covers: the backend stores "not an anomaly" per type and
// merchant, so every card of that pattern goes at once.
const patternOf = (a) => (a.type ?? a.anomaly_type ?? "") + "|" + (a.merchant || "");

// A card's identity is the anomaly it shows, never its position in the list:
// with index keys, removing card #1 handed its "Dismissing…" state to the
// card that moved into its slot, which then looked stuck.
function withStableKeys(list) {
  const seen = new Map();
  return list.map(a => {
    const base = [patternOf(a), a.category ?? "", a.amount ?? "", a.reason ?? ""].join("|");
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return { anomaly: a, key: n === 1 ? base : `${base}#${n}` };
  });
}

function AnomalyAlerts({ anomalies: incoming }) {
  // Derived from props on every render, so anomalies that load (or reload)
  // after this mounts still show; only the user's dismissals are local.
  const [dismissed, setDismissed] = useState(() => new Set());
  const anomalies = (incoming || []).filter(a => !dismissed.has(patternOf(a)));

  const handleDismiss = (a) => {
    setDismissed(prev => new Set(prev).add(patternOf(a)));
  };

  if (!anomalies?.length) {
    return (
      <GlassCard className="relative overflow-hidden p-6 mb-10 border border-white/10 bg-white/[0.03] backdrop-blur-xl">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(74,222,128,0.1)",
            border: "1px solid rgba(74,222,128,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ShieldCheck size={22} color="#4ade80" />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(74,222,128,0.5)", letterSpacing: "0.1em", marginBottom: 4 }}>
              AI ANOMALY DETECTION
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#4ade80", margin: 0 }}>No Anomalies Detected</h2>
            <p style={{ fontSize: 13, color: "rgba(148,163,184,0.5)", margin: "4px 0 0" }}>
              Your spending patterns look normal across all categories and merchants.
            </p>
          </div>
        </div>
      </GlassCard>
    );
  }

  const highCount = anomalies.filter(a => a.severity === "high").length;

  return (
    <GlassCard className="p-6 mb-10" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(248,113,113,0.1)",
          border: "1px solid rgba(248,113,113,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AlertTriangle size={18} color="#f87171" />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(248,113,113,0.5)", letterSpacing: "0.12em" }}>
            AI ANOMALY DETECTION
          </div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: "#fff", margin: 0 }}>
            Unusual Spending Detected
          </h2>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {highCount > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "#f87171", background: "rgba(248,113,113,0.1)",
              border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "4px 10px" }}>
              {highCount} high risk
            </span>
          )}
          <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.6)", background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "4px 10px" }}>
            {anomalies.length} total
          </span>
        </div>
      </div>

      {/* Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 14 }}>
        {withStableKeys(anomalies).map(({ anomaly, key }) => (
          <AnomalyCard key={key} anomaly={anomaly} onDismiss={handleDismiss} />
        ))}
      </div>

    </GlassCard>
  );
}

export default AnomalyAlerts;
