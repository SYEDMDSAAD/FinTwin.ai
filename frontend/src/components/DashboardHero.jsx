import { useState, useEffect } from "react";
import { Target, Bell, TrendingUp, Star } from "lucide-react";

function AnimatedNumber({ value = 0, suffix = "", duration = 1000 }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let s = 0;
    const step = value / (duration / 16);
    const t = setInterval(() => {
      s += step;
      if (s >= value) { setDisplay(value); clearInterval(t); }
      else setDisplay(Math.floor(s));
    }, 16);
    return () => clearInterval(t);
  }, [value, duration]);
  return <span>{Math.round(display)}{suffix}</span>;
}

function ScoreRing({ score = 0 }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setProgress(score), 400);
    return () => clearTimeout(t);
  }, [score]);
  const dash = circ * (progress / 100);
  const color = score >= 80 ? "#4ade80" : score >= 60 ? "#fbbf24" : "#f87171";

  return (
    <div style={{ position: "relative", width: 90, height: 90 }}>
      <svg width="90" height="90" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="45" cy="45" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
        <circle
          cx="45" cy="45" r={r} fill="none"
          stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: "stroke-dasharray 1.3s cubic-bezier(0.34,1.56,0.64,1)", filter: `drop-shadow(0 0 6px ${color}80)` }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.04em", lineHeight: 1 }}>{score || 0}</span>
        <span style={{ fontSize: 9, color: "rgba(148,163,184,0.5)", letterSpacing: "0.04em" }}>/100</span>
      </div>
    </div>
  );
}

function DashboardHero({ score = 0, savingsRatio = 0, activeGoals = 0, alerts = 0 }) {
  const scoreLabel = score >= 80 ? "Excellent" : score >= 60 ? "Good" : "Needs Work";
  const scoreColor = score >= 80 ? "#4ade80" : score >= 60 ? "#fbbf24" : "#f87171";

  const METRICS = [
    {
      label: "Savings Ratio",
      value: savingsRatio,
      suffix: "%",
      color: "#4ade80",
      icon: <TrendingUp size={14} color="#4ade80" />,
      bg: "rgba(74,222,128,0.08)",
      border: "rgba(74,222,128,0.18)",
      dur: 900,
    },
    {
      label: "Active Goals",
      value: activeGoals,
      suffix: "",
      color: "#22d3ee",
      icon: <Target size={14} color="#22d3ee" />,
      bg: "rgba(34,211,238,0.08)",
      border: "rgba(34,211,238,0.18)",
      dur: 700,
    },
    {
      label: "Budget Alerts",
      value: alerts,
      suffix: "",
      color: alerts > 0 ? "#f87171" : "#4ade80",
      icon: <Bell size={14} color={alerts > 0 ? "#f87171" : "#4ade80"} />,
      bg: alerts > 0 ? "rgba(248,113,113,0.08)" : "rgba(74,222,128,0.08)",
      border: alerts > 0 ? "rgba(248,113,113,0.18)" : "rgba(74,222,128,0.18)",
      dur: 600,
    },
  ];

  return (
    <>
      <style>{`
        .hero-wrap * { box-sizing: border-box; }
        .hero-wrap { font-family: inherit; margin-bottom: 24px; }
        .metric-pill { display:flex; align-items:center; gap:14px; padding:16px 20px; border-radius:14px; border:1px solid; transition:all 0.25s; flex:1; }
        .metric-pill:hover { transform:translateY(-2px); }
        @keyframes heroFade { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .hero-fade { animation: heroFade 0.5s ease both; }
        @keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
      `}</style>

      <div className="hero-wrap">
        <div style={{
          position: "relative", overflow: "hidden",
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 22, padding: "clamp(16px, 4vw, 28px) clamp(16px, 4vw, 32px)",
          marginBottom: 0,
        }}>
          {/* Ambient glows */}
          <div style={{ position: "absolute", top: -60, left: -40, width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle,rgba(167,139,250,0.1) 0%,transparent 70%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -40, right: 80, width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle,rgba(34,211,238,0.07) 0%,transparent 70%)", pointerEvents: "none" }} />

          {/* Top shimmer line */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg,transparent,rgba(167,139,250,0.4),rgba(34,211,238,0.3),transparent)" }} />

          <div className="hero-fade" style={{ display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>

            {/* ── Left: Score ring + label ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
              <ScoreRing score={score} />
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.12em", marginBottom: 4 }}>FINANCIAL SCORE</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: scoreColor, letterSpacing: "-0.02em", lineHeight: 1 }}>{scoreLabel}</div>
                <div style={{ marginTop: 8 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                    color: scoreColor, background: scoreColor + "18",
                    border: `1px solid ${scoreColor}35`, borderRadius: 7, padding: "3px 9px",
                  }}>
                    <Star size={9} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                    FinTwin Score™
                  </span>
                </div>
              </div>
            </div>

            {/* Divider — hidden on mobile */}
            <div className="hidden sm:block" style={{ width: 1, height: 70, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />

            {/* ── Center: Welcome text ── */}
            <div style={{ flex: 1, minWidth: 160 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: "0 0 4px", letterSpacing: "-0.02em" }}>
                Welcome Back 👋
              </h2>
              <p style={{ fontSize: 12, color: "rgba(148,163,184,0.5)", margin: 0, lineHeight: 1.6 }}>
                Here's your financial snapshot for today.<br />
                {score >= 80
                  ? "Your finances are in excellent shape. Keep it up!"
                  : score >= 60
                  ? "Good progress — a few tweaks can push you higher."
                  : "Let's work on improving your financial health."}
              </p>
            </div>

            {/* Divider — hidden on mobile */}
            <div className="hidden sm:block" style={{ width: 1, height: 70, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />

            {/* ── Right: Metric pills ── */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {METRICS.map((m) => (
                <div key={m.label} className="metric-pill" style={{ background: m.bg, borderColor: m.border, minWidth: "clamp(100px, 28vw, 130px)", flex: 1 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: m.color + "20", border: `1px solid ${m.color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {m.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em", marginBottom: 3 }}>{m.label.toUpperCase()}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: m.color, letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                      <AnimatedNumber value={m.value} suffix={m.suffix} duration={m.dur} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>
    </>
  );
}

export default DashboardHero;