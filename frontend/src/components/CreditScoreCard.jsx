import { useState, useEffect } from "react";
import { ShieldCheck, RefreshCw } from "lucide-react";
import API from "../services/api";

const SCORE_BANDS = [
  { label: "Poor",      min: 300, max: 549, color: "#f87171" },
  { label: "Fair",      min: 550, max: 649, color: "#fbbf24" },
  { label: "Good",      min: 650, max: 749, color: "#4ade80" },
  { label: "Very Good", min: 750, max: 799, color: "#22d3ee" },
  { label: "Excellent", min: 800, max: 900, color: "#a78bfa" },
];

function getBand(score) {
  return SCORE_BANDS.find(b => score >= b.min && score <= b.max) || SCORE_BANDS[0];
}

function ScoreGauge({ score }) {
  const min = 300, max = 900, range = max - min;
  const pct = Math.min(Math.max((score - min) / range, 0), 1);
  const band = getBand(score);

  return (
    <div style={{ position: "relative", marginBottom: 16 }}>
      <div style={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", gap: 2 }}>
        {SCORE_BANDS.map(b => (
          <div key={b.label} style={{ flex: 1, background: b.color + "30", borderRadius: 4 }} />
        ))}
      </div>
      <div style={{
        position: "absolute", top: -2, left: `calc(${pct * 100}% - 8px)`,
        width: 16, height: 16, borderRadius: "50%",
        background: band.color, border: "3px solid #080a0f",
        boxShadow: `0 0 10px ${band.color}80`,
        transition: "left 0.8s cubic-bezier(0.34,1.56,0.64,1)",
      }} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        {SCORE_BANDS.map(b => (
          <span key={b.label} style={{ fontSize: 9, color: "var(--text-dim)", fontWeight: 600 }}>{b.label}</span>
        ))}
      </div>
    </div>
  );
}

function FactorBar({ factor }) {
  const pct = factor.maxPoints > 0 ? (factor.points / factor.maxPoints) * 100 : 0;
  const color = factor.status === "good" ? "#4ade80" : factor.status === "warning" ? "#fbbf24" : factor.status === "poor" ? "#f87171" : "#94a3b8";

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{factor.label}</span>
          <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
            {factor.impact} impact · {factor.points}/{factor.maxPoints}
          </span>
        </div>
        <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
          <div style={{
            height: "100%", width: `${pct}%`,
            background: color, borderRadius: 3,
            transition: "width 1s ease",
          }} />
        </div>
        <div style={{ fontSize: 11, color: "rgba(148,163,184,0.6)", lineHeight: 1.5 }}>{factor.desc}</div>
      </div>
    </div>
  );
}

export default function CreditScoreCard() {
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [checking, setChecking] = useState(false);
  const [error,    setError]    = useState(false);

  const fetchScore = async () => {
    setChecking(true);
    setError(false);
    try {
      const res = await API.get("/credit-score");
      setData(res.data);
    } catch (err) {
      console.error("Credit score fetch failed", err);
      setError(true);
    } finally {
      setLoading(false);
      setChecking(false);
    }
  };

  useEffect(() => { fetchScore(); }, []);

  const score = data?.score ?? 0;
  const band  = getBand(score);

  return (
    <div style={{
      position: "relative", overflow: "hidden",
      background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 20, padding: "24px",
      marginBottom: 24,
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <div style={{ position: "absolute", inset: "0 0 auto", height: 1, background: "linear-gradient(90deg, transparent, rgba(34,211,238,0.4), transparent)" }} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ShieldCheck size={18} color="#22d3ee" />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.12em" }}>ESTIMATED SCORE</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>Credit Score</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(148,163,184,0.4)", fontSize: 13 }}>
          Calculating your score...
        </div>
      ) : error || !data ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(148,163,184,0.6)", fontSize: 13 }}>
          Couldn't load your score right now. Use Recalculate to try again.
        </div>
      ) : (
        <>
          {/* Score + Gauge */}
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 20 }}>
            <div style={{ textAlign: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 52, fontWeight: 900, color: band.color, letterSpacing: "-0.04em", lineHeight: 1, filter: `drop-shadow(0 0 12px ${band.color}50)` }}>
                {score}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em", marginTop: 4 }}>out of 900</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{
                display: "inline-block", fontSize: 13, fontWeight: 700,
                color: band.color, background: band.color + "15",
                border: `1px solid ${band.color}30`, borderRadius: 8, padding: "4px 12px",
                marginBottom: 10,
              }}>
                {data?.band ?? band.label}
              </div>
              <ScoreGauge score={score} />
            </div>
          </div>

          {/* Score Factors */}
          {data?.factors?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.1em", marginBottom: 12 }}>SCORE FACTORS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {data.factors.map(f => <FactorBar key={f.label} factor={f} />)}
              </div>
            </div>
          )}
        </>
      )}

      {/* Disclaimer — required: this is an internal estimate, not a bureau score */}
      {data?.disclaimer && (
        <p style={{ fontSize: 10.5, color: "rgba(148,163,184,0.55)", lineHeight: 1.5, margin: "0 0 12px", fontStyle: "italic" }}>
          {data.disclaimer}
        </p>
      )}

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Based on your last 3 months of data</span>
        <button
          onClick={fetchScore}
          disabled={checking}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 10, border: "1px solid rgba(34,211,238,0.25)",
            background: "rgba(34,211,238,0.08)", color: "#22d3ee",
            fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          <RefreshCw size={12} className={checking ? "animate-spin" : ""} />
          {checking ? "Recalculating..." : "Recalculate"}
        </button>
      </div>
    </div>
  );
}
