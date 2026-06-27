import { useEffect, useState } from "react";
import { Landmark, Wallet, TrendingUp, CreditCard, TrendingDown, PieChart, ArrowRight } from "lucide-react";
import API from "../services/api";

const gotoSection = (name) => {
  localStorage.setItem("activeSection", name);
  window.dispatchEvent(new Event("dashboardNav"));
};

const INVESTMENT_TYPES = new Set([
  "stocks", "stock", "mutual fund", "mutual funds", "mf",
  "fixed deposit", "fd", "gold", "ppf", "nps", "bonds", "bond",
  "crypto", "cryptocurrency", "investment", "investments",
]);
const isInvestmentType = (type) =>
  type ? INVESTMENT_TYPES.has(type.toLowerCase().trim()) : false;

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
  .nwp * { box-sizing: border-box; }
  .nwp { font-family: 'DM Sans', system-ui, sans-serif; }
  .nwp-card { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 20px; padding: 22px; position: relative; overflow: hidden; transition: all 0.25s; margin-bottom: 14px; }
  .nwp-card:hover { border-color: rgba(255,255,255,0.12); transform: translateY(-2px); }
  .nwp-card::after { content:''; position:absolute; top:0; left:0; right:0; height:1px; background:linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent); }
  .nwp-row { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-radius:11px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); margin-bottom:8px; transition:all 0.15s; }
  .nwp-row:hover { background:rgba(255,255,255,0.05); }
  @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
  .fade-up-1 { animation: fadeUp 0.4s ease both; }
  .fade-up-2 { animation: fadeUp 0.4s 0.08s ease both; }
  .fade-up-3 { animation: fadeUp 0.4s 0.16s ease both; }
  .nwp-stats { display: grid; gap: 12px; margin-bottom: 20px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
  .nwp-stat-value { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
  @media (max-width: 640px) {
    .nwp-stats { grid-template-columns: repeat(2, 1fr); }
    .nwp-stat-value { font-size: 15px; }
    .nwp-card { padding: 16px; }
    .nwp-row { flex-wrap: wrap; gap: 6px; }
    .nwp-row > div:last-child { font-size: 12px; }
  }
`;

function AnimatedNumber({ value = 0, duration = 1100 }) {
  const [d, setD] = useState(0);
  useEffect(() => {
    let s = 0; const step = value / (duration / 16);
    const t = setInterval(() => {
      s += step;
      if (s >= value) { setD(value); clearInterval(t); } else setD(Math.floor(s));
    }, 16);
    return () => clearInterval(t);
  }, [value, duration]);
  return <span>₹{Math.round(d).toLocaleString("en-IN")}</span>;
}

function NetWorthPage() {
  const [netWorth, setNetWorth] = useState(null);

  useEffect(() => {
    API.get("/net-worth").then((r) => setNetWorth(r.data)).catch(console.log);
  }, []);

  if (!netWorth) {
    return (
      <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <p style={{ fontSize: 13, color: "rgba(148,163,184,0.5)" }}>Loading Net Worth...</p>
      </div>
    );
  }

  const isHealthy = netWorth.netWorth >= 0;
  const totalAssets = netWorth.totalAssets || 0;
  const totalLiabilities = netWorth.totalLiabilities || 0;
  const portfolioValue = netWorth.portfolioCurrentValue || 0;
  const portfolioInvested = netWorth.portfolioInvested || 0;
  const portfolioPnl = netWorth.portfolioPnl || 0;
  const portfolioCount = netWorth.portfolioCount || 0;
  const totalWealth = totalAssets + portfolioValue + (netWorth.savings || 0);
  const assetPct = totalWealth + totalLiabilities > 0 ? Math.round((totalWealth / (totalWealth + totalLiabilities)) * 100) : 0;
  const portfolioPnlPct = portfolioInvested > 0 ? Math.round((portfolioPnl / portfolioInvested) * 10000) / 100 : 0;

  return (
    <>
      <style>{CSS}</style>
      <div className="nwp">

        {/* Page header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,rgba(167,139,250,0.25),rgba(34,211,238,0.15))", border: "1px solid rgba(167,139,250,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Wallet size={18} color="#a78bfa" />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em" }}>OVERVIEW</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>Net Worth</h1>
          </div>
        </div>

        {/* Hero net worth card */}
        <div className="nwp-card fade-up-1" style={{ padding: 32, marginBottom: 14 }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: isHealthy ? "linear-gradient(90deg,transparent,rgba(74,222,128,0.6),transparent)" : "linear-gradient(90deg,transparent,rgba(248,113,113,0.6),transparent)" }} />
          <div style={{ position: "absolute", top: -50, right: -50, width: 160, height: 160, borderRadius: "50%", background: isHealthy ? "radial-gradient(circle,rgba(74,222,128,0.07) 0%,transparent 70%)" : "radial-gradient(circle,rgba(248,113,113,0.07) 0%,transparent 70%)" }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.12em", marginBottom: 10 }}>TOTAL NET WORTH</div>
              <div style={{ fontSize: 44, fontWeight: 800, color: "#fff", letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums" }}>
                {netWorth.netWorth < 0 && <span style={{ color: "#f87171" }}>−</span>}
                <AnimatedNumber value={Math.abs(netWorth.netWorth)} duration={1400} />
              </div>

              {/* Asset ratio bar */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
                <div style={{ width: 200, height: 6, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${assetPct}%`, background: "linear-gradient(90deg,#4ade80,#22d3ee)", borderRadius: 3, transition: "width 1.4s ease" }} />
                </div>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  {assetPct}% assets · {100 - assetPct}% liabilities
                </span>
              </div>
            </div>

            <div style={{ padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700, color: isHealthy ? "#4ade80" : "#f87171", background: isHealthy ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)", border: `1px solid ${isHealthy ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}` }}>
              {isHealthy ? "✓ Healthy" : "⚠ Negative"}
            </div>
          </div>
        </div>

        {/* 5 summary cards */}
        <div className="nwp-stats fade-up-2">
          {[
            { label: "NET WORTH",   value: Math.abs(netWorth.netWorth), color: "#a78bfa", icon: <Wallet size={14} color="#a78bfa" />, dur: 1000 },
            { label: "TOTAL ASSETS",value: totalAssets,                  color: "#4ade80", icon: <TrendingUp size={14} color="#4ade80" />, dur: 900 },
            { label: "PORTFOLIO",   value: portfolioValue,               color: "#f59e0b", icon: <PieChart size={14} color="#f59e0b" />, dur: 950 },
            { label: "SAVINGS",     value: netWorth.savings || 0,        color: "#22d3ee", icon: <Landmark size={14} color="#22d3ee" />, dur: 1050 },
            { label: "LIABILITIES", value: totalLiabilities,             color: "#f87171", icon: <CreditCard size={14} color="#f87171" />, dur: 1100 },
          ].map((s) => (
            <div key={s.label} style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "18px 20px", position: "relative", overflow: "hidden", transition: "all 0.25s",
              cursor: s.label === "PORTFOLIO" ? "pointer" : "default" }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; }}
              onClick={s.label === "PORTFOLIO" ? () => gotoSection("Investments") : undefined}
            >
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${s.color}45,transparent)` }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em" }}>{s.label}</span>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: s.color + "18", border: `1px solid ${s.color}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>{s.icon}</div>
              </div>
              <div className="nwp-stat-value" style={{ color: s.color }}>
                <AnimatedNumber value={s.value} duration={s.dur} />
              </div>
              {s.label === "PORTFOLIO" && portfolioPnl !== 0 && (
                <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: portfolioPnl >= 0 ? "#4ade80" : "#f87171" }}>
                  {portfolioPnl >= 0 ? "▲" : "▼"} {portfolioPnlPct > 0 ? "+" : ""}{portfolioPnlPct}% P&L
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Investment Portfolio card */}
        {portfolioCount > 0 && (
          <div className="nwp-card fade-up-2" style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <PieChart size={13} color="#f59e0b" />
                </div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: "#f59e0b", margin: 0 }}>Investment Portfolio</h2>
                <span style={{ fontSize: 11, color: "rgba(245,158,11,0.6)", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 6, padding: "2px 8px" }}>
                  {portfolioCount} holding{portfolioCount !== 1 ? "s" : ""}
                </span>
              </div>
              <button
                onClick={() => gotoSection("Investments")}
                style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 9, padding: "7px 13px", color: "#f59e0b", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(245,158,11,0.15)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(245,158,11,0.08)"}
              >
                View Portfolio <ArrowRight size={13} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
              {[
                { label: "Invested",      value: portfolioInvested,    color: "rgba(148,163,184,0.8)" },
                { label: "Current Value", value: portfolioValue,       color: "#f59e0b" },
                { label: "P&L",           value: Math.abs(portfolioPnl), color: portfolioPnl >= 0 ? "#4ade80" : "#f87171",
                  prefix: portfolioPnl >= 0 ? "+" : "−" },
              ].map(c => (
                <div key={c.label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.45)", letterSpacing: "0.08em", marginBottom: 6 }}>{c.label.toUpperCase()}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: c.color, fontVariantNumeric: "tabular-nums" }}>
                    {c.prefix || ""}₹{Math.round(c.value).toLocaleString("en-IN")}
                  </div>
                </div>
              ))}
            </div>

            {/* Portfolio % of net worth bar */}
            {netWorth.netWorth > 0 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: "rgba(148,163,184,0.5)" }}>Portfolio as % of net worth</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b" }}>
                    {Math.round((portfolioValue / netWorth.netWorth) * 100)}%
                  </span>
                </div>
                <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, Math.round((portfolioValue / netWorth.netWorth) * 100))}%`, background: "linear-gradient(90deg,#f59e0b,#fbbf24)", borderRadius: 4, transition: "width 1.2s ease" }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Assets list */}
        <div className="nwp-card fade-up-3">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <TrendingUp size={13} color="#4ade80" />
            </div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#4ade80", margin: 0 }}>Assets</h2>
            <span style={{ fontSize: 11, color: "rgba(74,222,128,0.6)", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 6, padding: "2px 8px" }}>
              {(netWorth.assets?.filter(a => a.type !== "ManualSavings" && !isInvestmentType(a.type)).length || 0) + (portfolioCount > 0 ? 1 : 0)} items
            </span>
          </div>

          {/* Portfolio row (always first) */}
          {portfolioCount > 0 && (
            <div className="nwp-row" style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.15)", cursor: "pointer" }}
              onClick={() => gotoSection("Investments")}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>📈</div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", margin: 0 }}>Investment Portfolio</p>
                  <p style={{ fontSize: 11, color: "rgba(148,163,184,0.5)", margin: "2px 0 0" }}>
                    {portfolioCount} holding{portfolioCount !== 1 ? "s" : ""} · live prices · tap to manage
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {portfolioPnl !== 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: portfolioPnl >= 0 ? "#4ade80" : "#f87171" }}>
                    {portfolioPnl >= 0 ? "▲+" : "▼"}₹{Math.abs(Math.round(portfolioPnl)).toLocaleString("en-IN")}
                  </span>
                )}
                <span style={{ fontSize: 14, fontWeight: 700, color: "#f59e0b", fontVariantNumeric: "tabular-nums" }}>
                  ₹{Math.round(portfolioValue).toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          )}

          {/* Regular non-investment assets */}
          {netWorth.assets?.filter(a => a.type !== "ManualSavings" && !isInvestmentType(a.type)).map((asset) => (
            <div key={asset.id} className="nwp-row">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
                  {asset.type?.toLowerCase().includes("real") || asset.type?.toLowerCase().includes("property") ? "🏠" :
                   asset.type?.toLowerCase().includes("vehicle") ? "🚗" :
                   asset.type?.toLowerCase().includes("jewel") ? "💍" : "💼"}
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", margin: 0 }}>{asset.name}</p>
                  <p style={{ fontSize: 11, color: "rgba(148,163,184,0.5)", margin: "2px 0 0" }}>{asset.type}</p>
                </div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#4ade80", fontVariantNumeric: "tabular-nums" }}>
                ₹{asset.amount?.toLocaleString("en-IN")}
              </span>
            </div>
          ))}
        </div>

        {/* Liabilities list */}
        <div className="nwp-card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <TrendingDown size={13} color="#f87171" />
            </div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#f87171", margin: 0 }}>Liabilities</h2>
            <span style={{ fontSize: 11, color: "rgba(248,113,113,0.6)", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 6, padding: "2px 8px" }}>
              {netWorth.liabilities?.length || 0} items
            </span>
          </div>
          {netWorth.liabilities?.map((liability) => (
            <div key={liability.id} className="nwp-row">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
                  {liability.type?.toLowerCase().includes("home") || liability.type?.toLowerCase().includes("mortgage") ? "🏠" : liability.type?.toLowerCase().includes("car") ? "🚗" : liability.type?.toLowerCase().includes("student") ? "🎓" : "💳"}
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", margin: 0 }}>{liability.name}</p>
                  <p style={{ fontSize: 11, color: "var(--text-dim)", margin: "2px 0 0" }}>{liability.type}</p>
                </div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#f87171", fontVariantNumeric: "tabular-nums" }}>
                ₹{liability.amount?.toLocaleString("en-IN")}
              </span>
            </div>
          ))}
        </div>

      </div>
    </>
  );
}

export default NetWorthPage;