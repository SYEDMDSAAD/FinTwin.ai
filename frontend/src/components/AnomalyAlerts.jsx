import GlassCard from "./GlassCard";
import { AlertTriangle, ShieldCheck, TrendingUp, Zap, BarChart2, Calendar } from "lucide-react";

const SEVERITY = {
  high:   { color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.22)", label: "High Risk" },
  medium: { color: "#fbbf24", bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.22)",  label: "Medium Risk" },
  low:    { color: "#22d3ee", bg: "rgba(34,211,238,0.08)",  border: "rgba(34,211,238,0.22)",  label: "Low Risk" },
};

const TYPE_META = {
  merchant_spike:  { icon: <TrendingUp size={14} />,  label: "Merchant Spike" },
  category_spike:  { icon: <BarChart2 size={14} />,   label: "Category Surge" },
  category_surge:  { icon: <BarChart2 size={14} />,   label: "Category Surge" },
  large_single:    { icon: <Zap size={14} />,          label: "Large Transaction" },
  large_transaction: { icon: <Zap size={14} />,        label: "Large Transaction" },
  burst:           { icon: <Calendar size={14} />,     label: "Spending Burst" },
};

function AnomalyCard({ anomaly }) {
  const sev  = SEVERITY[anomaly.severity] || SEVERITY.low;
  const meta = TYPE_META[anomaly.type] || TYPE_META[anomaly.anomaly_type] || { icon: <AlertTriangle size={14} />, label: "Anomaly" };

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
          borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: sev.color + "99",
            letterSpacing: "0.08em", marginBottom: 4 }}>WHAT TO DO</div>
          <p style={{ fontSize: 12, color: "#d1d5db", lineHeight: 1.6, margin: 0 }}>
            {anomaly.action}
          </p>
        </div>
      )}
    </div>
  );
}

function AnomalyAlerts({ anomalies }) {

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
        {anomalies.map((anomaly, i) => <AnomalyCard key={i} anomaly={anomaly} />)}
      </div>

    </GlassCard>
  );
}

export default AnomalyAlerts;
