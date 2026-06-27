import { useEffect, useState } from "react";
import API from "../services/api";
import { Brain, RefreshCw, Zap, TrendingDown, Heart } from "lucide-react";

const STORAGE_KEY = "fintwin_spending_coach";

function loadCoach() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
function saveCoach(coach) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ coach, savedAt: new Date().toISOString() })); } catch {}
}
 
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
  .coach-page * { box-sizing: border-box; }
  .coach-page { font-family: 'DM Sans', system-ui, sans-serif; margin-bottom: 32px; }
  .coach-card { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 20px; padding: 24px; position: relative; overflow: hidden; margin-bottom: 16px; }
  .coach-card::after { content:''; position:absolute; top:0; left:0; right:0; height:1px; background:linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent); }
  .coach-tip { background: rgba(167,139,250,0.05); border: 1px solid rgba(167,139,250,0.13); border-left: 3px solid #a78bfa; border-radius: 12px; padding: 14px 16px; transition: all 0.2s; }
  .coach-tip:hover { background: rgba(167,139,250,0.09); }
  @keyframes pulse-ring { 0%,100%{opacity:0.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.04)} }
  .pulse-ring { animation: pulse-ring 2.5s ease infinite; }
  @keyframes spin-slow { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  .spin-slow { animation: spin-slow 2s linear infinite; }
`;
 
const HEALTH_CONFIG = {
  Excellent: { color: "#4ade80", bg: "rgba(74,222,128,0.1)", border: "rgba(74,222,128,0.25)" },
  Good:      { color: "#22d3ee", bg: "rgba(34,211,238,0.1)",  border: "rgba(34,211,238,0.25)" },
  Average:   { color: "#fbbf24", bg: "rgba(251,191,36,0.1)",  border: "rgba(251,191,36,0.25)" },
  Poor:      { color: "#f87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.25)" },
};
 
function SpendingCoachPage() {
  const saved = loadCoach();
  const [coach, setCoach] = useState(saved?.coach || null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(!!saved?.coach);
  const [savedAt, setSavedAt] = useState(saved?.savedAt || null);
 
  const fetchCoach = async () => {
    setLoading(true);
    try {
      const response = await API.get("/spending-coach");
      setCoach(response.data);
      setGenerated(true);
      saveCoach(response.data);
      setSavedAt(new Date().toISOString());
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  };
 
  const cleanText = (text) =>
    text?.replace(/\*\*/g, "")?.replace(/\*/g, "")?.replace(/#/g, "")?.trim();
 
  const hc = HEALTH_CONFIG[coach?.spendingHealth] || HEALTH_CONFIG["Average"];
 
  // ── Loading ──
  if (loading) {
    return (
      <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, gap: 16 }}>
        <div className="pulse-ring" style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Brain size={26} color="#a78bfa" className="spin-slow" />
        </div>
        <p style={{ fontSize: 13, color: "rgba(148,163,184,0.6)", letterSpacing: "0.04em" }}>Generating AI Spending Insights...</p>
      </div>
    );
  }
 
  // ── Empty state ──
  if (!coach && !generated) {
    return (
      <>
        <style>{CSS}</style>
        <div className="coach-page">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,rgba(167,139,250,0.25),rgba(34,211,238,0.15))", border: "1px solid rgba(167,139,250,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Brain size={18} color="#a78bfa" />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em" }}>AI SUITE</div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>AI Spending Coach</h1>
            </div>
          </div>
 
          <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 24, padding: "60px 40px", textAlign: "center", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle,rgba(167,139,250,0.08) 0%,transparent 70%)", pointerEvents: "none" }} />
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <Brain size={30} color="#a78bfa" />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: "0 0 10px", letterSpacing: "-0.02em" }}>Get Personalized Spending Insights</h2>
            <p style={{ fontSize: 13, color: "rgba(148,163,184,0.5)", margin: "0 0 28px", lineHeight: 1.6 }}>Our AI analyzes your transaction patterns and generates<br />personalized tips to optimize your spending habits.</p>
            <button
              onClick={fetchCoach}
              style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "13px 28px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#a78bfa,#7c3aed)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.02em" }}
              onMouseEnter={e => { e.currentTarget.style.opacity = "0.9"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = ""; }}
            >
              <Zap size={16} /> Generate Insights
            </button>
          </div>
        </div>
      </>
    );
  }
 
  // ── Main view ──
  return (
    <>
      <style>{CSS}</style>
      <div className="coach-page">
 
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,rgba(167,139,250,0.25),rgba(34,211,238,0.15))", border: "1px solid rgba(167,139,250,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Brain size={18} color="#a78bfa" />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em" }}>AI SUITE</div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>AI Spending Coach</h1>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {savedAt && (
              <span style={{ fontSize: 10, color: "rgba(100,116,139,0.5)", fontFamily: "'DM Mono', monospace" }}>
                Generated {new Date(savedAt).toLocaleString()}
              </span>
            )}
            <button
              onClick={fetchCoach}
              disabled={loading}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 10, border: "1px solid rgba(167,139,250,0.25)", background: "rgba(167,139,250,0.1)", color: "#a78bfa", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
            >
              <RefreshCw size={13} /> Regenerate Insights
            </button>
          </div>
        </div>
 
        {/* Top metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          {/* Spending Health */}
          <div className="coach-card" style={{ background: hc.bg, borderColor: hc.border }}>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${hc.color}60,transparent)` }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: hc.color + "20", border: `1px solid ${hc.color}35`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Heart size={14} color={hc.color} />
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: hc.color + "aa", letterSpacing: "0.1em" }}>SPENDING HEALTH</div>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: hc.color, letterSpacing: "-0.03em" }}>{coach.spendingHealth}</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6 }}>AI-evaluated spending behavior</div>
          </div>
 
          {/* Monthly Leakage */}
          <div className="coach-card" style={{ background: "rgba(248,113,113,0.06)", borderColor: "rgba(248,113,113,0.15)" }}>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg,transparent,rgba(248,113,113,0.5),transparent)" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <TrendingDown size={14} color="#f87171" />
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(248,113,113,0.6)", letterSpacing: "0.1em" }}>MONTHLY LEAKAGE</div>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: "#f87171", letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>
              ₹{coach.monthlyLeakage?.toLocaleString("en-IN")}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6 }}>Avoidable monthly spending</div>
          </div>
        </div>
 
        {/* Coach Insight */}
        <div className="coach-card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Brain size={14} color="#a78bfa" />
            </div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(167,139,250,0.6)", letterSpacing: "0.1em" }}>AI GENERATED</div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: 0 }}>Coach Insight</h3>
            </div>
            <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "#a78bfa", background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 8, padding: "3px 10px", letterSpacing: "0.04em" }}>
              ✦ AI Coach
            </span>
          </div>
          <div style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.06)", borderLeft: "3px solid #a78bfa", borderRadius: 12, padding: "16px 18px" }}>
            <p style={{ fontSize: 13, color: "#d1d5db", lineHeight: 1.8, margin: 0 }}>
              {cleanText(coach.coachMessage)}
            </p>
          </div>
        </div>
 
        {/* Tips */}
        {coach.tips?.length > 0 && (
          <div className="coach-card">
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em", marginBottom: 16 }}>
              AI TIPS — {coach.tips.length} RECOMMENDATIONS
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {coach.tips.map((tip, i) => (
                <div key={i} className="coach-tip">
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ color: "#a78bfa", flexShrink: 0, marginTop: 2, fontSize: 14, lineHeight: 1 }}>•</span>
                    <p style={{ fontSize: 12, color: "#d1d5db", margin: 0, lineHeight: 1.6 }}>
                      {cleanText(tip)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
 
export default SpendingCoachPage;