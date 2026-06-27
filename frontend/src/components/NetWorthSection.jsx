import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Wallet, DollarSign } from "lucide-react";

function AnimatedNumber({ value = 0, prefix = "₹", duration = 1200 }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = value / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= value) { setDisplay(value); clearInterval(timer); }
      else setDisplay(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [value, duration]);
  return <span>{prefix}{Math.round(display).toLocaleString("en-IN")}</span>;
}

function NetWorthSection({ netWorth, assets, liabilities }) {
  if (!netWorth) return null;

  const isHealthy = netWorth.netWorth >= 0;
  const totalAssets = (netWorth?.totalAssets || 0) + (netWorth?.portfolioCurrentValue || 0);
  const totalLiabilities = netWorth?.totalLiabilities || 0;
  const savings = netWorth?.savings || 0;
  const totalWealth = totalAssets + savings;
  const assetPct = (totalWealth + totalLiabilities) > 0
    ? Math.round((totalWealth / (totalWealth + totalLiabilities)) * 100) : 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        .nw-section { font-family: 'DM Sans', system-ui, sans-serif; margin-bottom: 32px; }
        .nw-card { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 18px; padding: 18px; position: relative; overflow: hidden; transition: all 0.25s; }
        .nw-card:hover { border-color: rgba(255,255,255,0.12); transform: translateY(-2px); }
        .nw-card::after { content:''; position:absolute; top:0; left:0; right:0; height:1px; background:linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent); }
        .nw-stats-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
        @media (max-width: 640px) { .nw-stats-grid { grid-template-columns: 1fr 1fr; } .nw-card { padding: 14px; } }
      `}</style>

      <div className="nw-section">
        {/* Section label */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Wallet size={16} color="#a78bfa" />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em" }}>WEALTH TRACKER</div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: 0 }}>Net Worth Tracker</h2>
          </div>
        </div>

        {/* Main net worth hero */}
        <div style={{
          background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 20, padding: 28, marginBottom: 14, position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: isHealthy ? "linear-gradient(90deg,transparent,rgba(74,222,128,0.5),transparent)" : "linear-gradient(90deg,transparent,rgba(248,113,113,0.5),transparent)" }} />
          <div style={{ position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: "50%", background: isHealthy ? "radial-gradient(circle,rgba(74,222,128,0.08) 0%,transparent 70%)" : "radial-gradient(circle,rgba(248,113,113,0.08) 0%,transparent 70%)" }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.12em", marginBottom: 10 }}>TOTAL NET WORTH</div>
              <div style={{ fontSize: 40, fontWeight: 800, color: "#fff", letterSpacing: "-0.04em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {netWorth.netWorth < 0 && <span style={{ color: "#f87171" }}>−</span>}
                <AnimatedNumber value={Math.abs(netWorth.netWorth)} />
              </div>
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ height: 6, width: 180, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${assetPct}%`, background: "linear-gradient(90deg,#4ade80,#22d3ee)", borderRadius: 3, transition: "width 1.2s ease" }} />
                </div>
                <span style={{ fontSize: 11, color: "rgba(148,163,184,0.5)" }}>{assetPct}% assets</span>
              </div>
            </div>
            <div style={{
              padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700, letterSpacing: "0.04em",
              color: isHealthy ? "#4ade80" : "#f87171",
              background: isHealthy ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
              border: `1px solid ${isHealthy ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
            }}>
              {isHealthy ? "✓ Healthy" : "⚠ Negative"}
            </div>
          </div>
        </div>

        {/* 3 stat cards */}
        <div className="nw-stats-grid">
          {[
            { label: "TOTAL ASSETS", value: totalAssets, color: "#4ade80", icon: <TrendingUp size={14} color="#4ade80" />, duration: 900 },
            { label: "SAVINGS", value: savings, color: "#22d3ee", icon: <Wallet size={14} color="#22d3ee" />, duration: 1050 },
            { label: "LIABILITIES", value: totalLiabilities, color: "#f87171", icon: <TrendingDown size={14} color="#f87171" />, duration: 1200 },
          ].map((s) => (
            <div key={s.label} className="nw-card">
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${s.color}40,transparent)` }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em" }}>{s.label}</span>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: s.color + "18", border: `1px solid ${s.color}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>{s.icon}</div>
              </div>
              <div style={{ fontSize: "clamp(14px, 3.5vw, 22px)", fontWeight: 800, color: s.color, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                <AnimatedNumber value={s.value} duration={s.duration} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default NetWorthSection;