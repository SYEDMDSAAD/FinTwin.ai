import { useState } from "react";
import API from "../services/api";
import {
  Brain, RefreshCw, Zap, TrendingDown, TrendingUp, Heart, AlertTriangle,
  Info, CheckCircle2, Wallet, Sparkles, CircleDollarSign,
} from "lucide-react";

const STORAGE_KEY = "fintwin_spending_coach";

function loadCoach() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
function saveCoach(coach) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ coach, savedAt: new Date().toISOString() })); } catch {}
}

/* Leakage segments. Validated for both surfaces with the palette checker:
   lightness band, chroma floor, CVD separation (worst adjacent ΔE 12.6 deutan)
   and 3:1 contrast all pass on #0d0f17 and #ffffff, so one set serves both
   themes. Do not re-pick these by eye. */
const SEGMENTS = [
  { key: "variable",      color: "#8b5cf6", label: "Month-to-month swing" },
  { key: "spikes",        color: "#0891b2", label: "One-off spikes" },
  { key: "subscriptions", color: "#d97706", label: "Subscriptions" },
];

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap');

  .sc * { box-sizing: border-box; }
  .sc {
    font-family: 'DM Sans', system-ui, sans-serif;
    margin-bottom: 32px;

    --sc-surface: #0d0f17;
    --sc-card: rgba(255,255,255,0.025);
    --sc-card-hover: rgba(255,255,255,0.045);
    --sc-border: rgba(255,255,255,0.08);
    --sc-border-strong: rgba(255,255,255,0.14);
    --sc-ink: #e8eaf0;
    --sc-ink-2: rgba(203,213,225,0.78);
    --sc-ink-3: rgba(148,163,184,0.62);
    --sc-accent: #a78bfa;
    --sc-accent-soft: rgba(167,139,250,0.12);
    --sc-good: #4ade80;
    --sc-warn: #fbbf24;
    --sc-crit: #f87171;
    --sc-track: rgba(255,255,255,0.07);
  }
  :root[data-theme="light"] .sc {
    --sc-surface: #ffffff;
    --sc-card: #ffffff;
    --sc-card-hover: #fbfaff;
    --sc-border: rgba(109,40,217,0.13);
    --sc-border-strong: rgba(109,40,217,0.24);
    --sc-ink: #0f172a;
    --sc-ink-2: rgba(30,41,59,0.82);
    --sc-ink-3: rgba(51,65,85,0.62);
    --sc-accent: #7c3aed;
    --sc-accent-soft: rgba(124,58,237,0.09);
    --sc-good: #0ca30c;
    --sc-warn: #b45309;
    --sc-crit: #d03b3b;
    --sc-track: rgba(15,23,42,0.08);
  }

  .sc-card {
    background: var(--sc-card);
    border: 1px solid var(--sc-border);
    border-radius: 18px;
    padding: 20px;
  }
  :root[data-theme="light"] .sc-card {
    box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(109,40,217,0.06);
  }

  .sc-eyebrow {
    font-size: 10px; font-weight: 700; letter-spacing: 0.11em;
    text-transform: uppercase; color: var(--sc-ink-3);
  }
  .sc-h1 { font-size: 22px; font-weight: 700; color: var(--sc-ink); margin: 0; letter-spacing: -0.02em; }
  .sc-h2 { font-size: 13px; font-weight: 700; color: var(--sc-ink); margin: 0; letter-spacing: -0.01em; }

  .sc-btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 9px 16px; border-radius: 10px; cursor: pointer;
    font-family: inherit; font-size: 12px; font-weight: 700;
    border: 1px solid var(--sc-border-strong);
    background: var(--sc-accent-soft); color: var(--sc-accent);
    transition: background 0.15s, transform 0.15s;
  }
  .sc-btn:hover { transform: translateY(-1px); }
  /* Scoped away from the primary button: an unscoped .sc-btn:hover outranks
     .sc-btn-primary on specificity and repaints the gradient with the card
     colour, leaving white text on a white button. */
  .sc-btn:not(.sc-btn-primary):hover { background: var(--sc-card-hover); }
  .sc-btn-primary {
    padding: 13px 26px; font-size: 14px; border: none; border-radius: 12px;
    background: linear-gradient(135deg, #a78bfa, #7c3aed); color: #fff;
  }
  .sc-btn-primary:hover {
    background: linear-gradient(135deg, #b39dfb, #8b4bf0);
    box-shadow: 0 6px 18px rgba(124,58,237,0.35);
  }

  /* ── KPI row ─────────────────────────────────────────────── */
  .sc-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 14px; }
  .sc-kpi-label { display: flex; align-items: center; gap: 7px; margin-bottom: 14px; }
  .sc-kpi-value {
    font-size: 28px; font-weight: 700; color: var(--sc-ink);
    letter-spacing: -0.03em; line-height: 1.05; font-variant-numeric: tabular-nums;
  }
  /* Exactly one hero figure on the page. */
  .sc-hero-value { font-size: 48px; font-weight: 800; letter-spacing: -0.035em; }
  .sc-kpi-sub { font-size: 11px; color: var(--sc-ink-3); margin-top: 7px; line-height: 1.5; }

  /* ── Segmented meter ─────────────────────────────────────── */
  .sc-meter { display: flex; gap: 2px; height: 8px; margin-top: 16px; }
  .sc-meter-seg:first-child { border-radius: 4px 0 0 4px; }
  .sc-meter-seg:last-child  { border-radius: 0 4px 4px 0; }
  .sc-meter-seg:only-child  { border-radius: 4px; }
  .sc-meter-track { flex: 1; background: var(--sc-track); border-radius: 4px; }
  .sc-legend { display: flex; flex-wrap: wrap; gap: 10px 16px; margin-top: 12px; }
  .sc-legend-item { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--sc-ink-3); }
  .sc-legend-dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
  .sc-legend-value { color: var(--sc-ink-2); font-weight: 600; font-variant-numeric: tabular-nums; }

  /* ── Caveats ─────────────────────────────────────────────── */
  .sc-caveats { border-left: 3px solid var(--sc-warn); margin-bottom: 14px; }
  .sc-caveat { display: flex; gap: 9px; font-size: 12px; color: var(--sc-ink-2); line-height: 1.6; }
  .sc-caveat + .sc-caveat { margin-top: 9px; }

  /* ── Insights ────────────────────────────────────────────── */
  .sc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .sc-insight {
    display: flex; gap: 11px; padding: 14px 15px; border-radius: 12px;
    background: var(--sc-accent-soft); border: 1px solid var(--sc-border);
    transition: background 0.15s;
  }
  .sc-insight:hover { background: var(--sc-card-hover); }
  .sc-insight-title { font-size: 12.5px; font-weight: 700; color: var(--sc-ink); line-height: 1.45; }
  .sc-insight-detail { font-size: 11.5px; color: var(--sc-ink-3); line-height: 1.6; margin-top: 4px; }

  /* ── Recommendations ─────────────────────────────────────── */
  .sc-rec { display: flex; gap: 14px; padding: 16px 0; border-top: 1px solid var(--sc-border); }
  .sc-rec:first-child { border-top: none; padding-top: 4px; }
  .sc-rank {
    flex-shrink: 0; width: 26px; height: 26px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    background: var(--sc-accent-soft); color: var(--sc-accent);
    font-size: 11px; font-weight: 800; font-variant-numeric: tabular-nums;
  }
  .sc-rec-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .sc-rec-action { font-size: 13.5px; font-weight: 700; color: var(--sc-ink); letter-spacing: -0.01em; }
  .sc-rec-why { font-size: 12px; color: var(--sc-ink-2); line-height: 1.65; margin-top: 6px; }
  .sc-rec-evidence {
    font-size: 10.5px; color: var(--sc-ink-3); margin-top: 8px;
    font-family: 'DM Mono', ui-monospace, monospace; letter-spacing: 0.01em;
  }
  .sc-impact {
    margin-left: auto; flex-shrink: 0; text-align: right;
    font-size: 15px; font-weight: 800; color: var(--sc-ink);
    letter-spacing: -0.02em; font-variant-numeric: tabular-nums;
  }
  .sc-impact-unit { font-size: 10px; font-weight: 600; color: var(--sc-ink-3); display: block; margin-top: 1px; }
  .sc-chip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700;
    letter-spacing: 0.03em; border: 1px solid var(--sc-border);
    color: var(--sc-ink-3); background: var(--sc-track);
  }

  /* A prerequisite gates the quality of everything below it, so it is the one
     chip allowed to carry the accent rather than recede. */
  .sc-chip-first {
    color: var(--sc-accent); background: var(--sc-accent-soft);
    border-color: var(--sc-border-strong);
  }

  .sc-footer {
    display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 16px;
    font-size: 11px; color: var(--sc-ink-3);
  }

  @media (max-width: 900px) {
    .sc-kpis, .sc-grid { grid-template-columns: 1fr; }
  }

  @keyframes sc-pulse { 0%,100%{opacity:0.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.04)} }
  .sc-pulse { animation: sc-pulse 2.5s ease infinite; }
  @keyframes sc-spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
  .sc-spin { animation: sc-spin 2s linear infinite; }
`;

/* Health is a status, so it ships as colour *and* an icon *and* the word. */
const HEALTH = {
  Excellent: { tone: "var(--sc-good)", icon: CheckCircle2 },
  Good:      { tone: "var(--sc-good)", icon: CheckCircle2 },
  Average:   { tone: "var(--sc-warn)", icon: Info },
  Poor:      { tone: "var(--sc-crit)", icon: AlertTriangle },
  /* Both services now speak the vocabulary above, but a verdict cached in
     localStorage outlives the deploy that changed it. The retired words are
     kept so yesterday's result is not styled as a missing one — "Needs
     Attention" in particular fell through to the neutral grey of Unknown,
     which is the opposite of what it meant. */
  Fair:                { tone: "var(--sc-warn)", icon: Info },
  "Needs Attention":   { tone: "var(--sc-crit)", icon: AlertTriangle },
  /* Spending health means "how much of what you earn do you keep". Without
     trustworthy income there is no verdict, and the tile says so rather than
     picking one. */
  Unrated:   { tone: "var(--sc-ink-3)", icon: Info },
  Unknown:   { tone: "var(--sc-ink-3)", icon: Info },
};

const TONE = {
  warn: { color: "var(--sc-warn)", Icon: TrendingUp },
  good: { color: "var(--sc-good)", Icon: TrendingDown },
  info: { color: "var(--sc-accent)", Icon: Info },
};

const EFFORT = { low: "Quick win", medium: "Habit change", high: "Big change" };

const rupees = (value) =>
  value == null ? "—" : `₹${Math.round(value).toLocaleString("en-IN")}`;

const clean = (text) => text?.replace(/[*#]/g, "").trim();

function Header({ generated, savedAt, loading, onRefresh }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,rgba(167,139,250,0.28),rgba(34,211,238,0.16))", border: "1px solid rgba(167,139,250,0.32)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Brain size={18} color="#a78bfa" />
        </div>
        <div>
          <div className="sc-eyebrow">AI Suite</div>
          <h1 className="sc-h1">AI Spending Coach</h1>
        </div>
      </div>
      {generated && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {savedAt && (
            <span style={{ fontSize: 10.5, color: "var(--sc-ink-3)" }}>
              Generated {new Date(savedAt).toLocaleString()}
            </span>
          )}
          <button className="sc-btn" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={13} /> Regenerate
          </button>
        </div>
      )}
    </div>
  );
}

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
      console.error("Spending coach load failed:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <>
        <style>{CSS}</style>
        <div className="sc" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 320, gap: 16 }}>
          <div className="sc-pulse" style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--sc-accent-soft)", border: "1px solid var(--sc-border-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Brain size={26} color="#a78bfa" className="sc-spin" />
          </div>
          <p style={{ fontSize: 13, color: "var(--sc-ink-3)" }}>Analysing your transactions…</p>
        </div>
      </>
    );
  }

  if (!coach && !generated) {
    return (
      <>
        <style>{CSS}</style>
        <div className="sc">
          <Header generated={generated} savedAt={savedAt} loading={loading} onRefresh={fetchCoach} />
          <div className="sc-card" style={{ padding: "60px 40px", textAlign: "center", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle,rgba(167,139,250,0.09) 0%,transparent 70%)", pointerEvents: "none" }} />
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--sc-accent-soft)", border: "1px solid var(--sc-border-strong)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <Brain size={30} color="#a78bfa" />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--sc-ink)", margin: "0 0 10px", letterSpacing: "-0.02em" }}>
              Find what your money is doing
            </h2>
            <p style={{ fontSize: 13, color: "var(--sc-ink-3)", margin: "0 0 28px", lineHeight: 1.7 }}>
              We read every transaction in your last three months — recurring charges,<br />
              one-off spikes, category drift — then rank what is worth acting on.
            </p>
            <button className="sc-btn sc-btn-primary" onClick={fetchCoach}>
              <Zap size={16} /> Analyse my spending
            </button>
          </div>
        </div>
      </>
    );
  }

  const health = HEALTH[coach.spendingHealth] || HEALTH.Unknown;
  const HealthIcon = health.icon;
  const snapshot = coach.snapshot || {};
  const coverage = coach.coverage || {};
  const caveats = coverage.caveats || [];
  const breakdown = coach.leakageBreakdown || {};
  const insights = coach.insights || [];
  const recommendations = coach.recommendations?.length
    ? coach.recommendations
    : (coach.tips || []).map((tip, i) => ({ action: tip, priority: i + 1, source: "fallback" }));

  const segments = SEGMENTS
    .map((s) => ({ ...s, value: breakdown[s.key] || 0 }))
    .filter((s) => s.value > 0);
  const segmentTotal = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <>
      <style>{CSS}</style>
      <div className="sc">
        <Header generated={generated} savedAt={savedAt} loading={loading} onRefresh={fetchCoach} />

        {caveats.length > 0 && (
          <div className="sc-card sc-caveats">
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 11 }}>
              <AlertTriangle size={13} style={{ color: "var(--sc-warn)" }} />
              <span className="sc-eyebrow" style={{ color: "var(--sc-warn)" }}>Read these first</span>
            </div>
            {caveats.map((caveat, i) => (
              <div className="sc-caveat" key={i}>
                <span style={{ color: "var(--sc-warn)", flexShrink: 0 }}>•</span>
                <span>{caveat}</span>
              </div>
            ))}
          </div>
        )}

        {/* KPI row */}
        <div className="sc-kpis">
          <div className="sc-card">
            <div className="sc-kpi-label">
              <Heart size={13} style={{ color: health.tone }} />
              <span className="sc-eyebrow">Spending health</span>
            </div>
            <div
              className="sc-kpi-value"
              style={{ display: "flex", alignItems: "center", gap: 9,
                       fontSize: coach.spendingHealth === "Unrated" ? 22 : undefined }}
            >
              <HealthIcon size={22} style={{ color: health.tone }} />
              {coach.spendingHealth === "Unrated" ? "Not rated" : coach.spendingHealth}
            </div>
            <div className="sc-kpi-sub">
              {snapshot.savingsRate != null
                ? `${snapshot.savingsRate}% of income kept, against a 20% benchmark`
                : "Your income could not be verified from this data, so there is no savings rate to judge this on."}
            </div>
          </div>

          <div className="sc-card">
            <div className="sc-kpi-label">
              <TrendingDown size={13} style={{ color: "var(--sc-accent)" }} />
              <span className="sc-eyebrow">Recoverable each month</span>
            </div>
            <div className="sc-kpi-value sc-hero-value">{rupees(coach.monthlyLeakage)}</div>
            {segmentTotal > 0 && (
              <>
                <div className="sc-meter">
                  {segments.map((s) => (
                    <div
                      key={s.key}
                      className="sc-meter-seg"
                      style={{ flex: s.value, background: s.color }}
                      title={`${s.label}: ${rupees(s.value)}`}
                    />
                  ))}
                </div>
                <div className="sc-legend">
                  {segments.map((s) => (
                    <span className="sc-legend-item" key={s.key}>
                      <span className="sc-legend-dot" style={{ background: s.color }} />
                      {s.label} <span className="sc-legend-value">{rupees(s.value)}</span>
                    </span>
                  ))}
                </div>
              </>
            )}
            {breakdown.basis === "estimate" && (
              <div className="sc-kpi-sub">
                Estimated — a second full month of data will measure this properly.
              </div>
            )}
            {coverage.uncategorisedShare >= 50 && (
              <div className="sc-kpi-sub">
                With your spend uncategorised, this may include rent and bills.
              </div>
            )}
          </div>

          <div className="sc-card">
            <div className="sc-kpi-label">
              <Wallet size={13} style={{ color: "var(--sc-accent)" }} />
              <span className="sc-eyebrow">Monthly spend</span>
            </div>
            <div className="sc-kpi-value">{rupees(snapshot.monthlyExpense)}</div>
            <div className="sc-kpi-sub">
              {/* The committed/discretionary split is only stated where the
                  categories exist to support it. */}
              {snapshot.monthlyFixed > 0 && (coverage.uncategorisedShare ?? 0) < 50 && (
                <>{rupees(snapshot.monthlyFixed)} committed · {rupees(snapshot.monthlyDiscretionary)} discretionary<br /></>
              )}
              {snapshot.monthlyIncome > 0
                ? <>Against {rupees(snapshot.monthlyIncome)} coming in</>
                : <>Averaged over {coverage.months} complete month{coverage.months === 1 ? "" : "s"}</>}
            </div>
          </div>
        </div>

        {/* Coach message */}
        {coach.coachMessage && (
          <div className="sc-card" style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 13 }}>
              <Sparkles size={13} style={{ color: "var(--sc-accent)" }} />
              <h3 className="sc-h2">Coach's read</h3>
              <span className="sc-chip" style={{ marginLeft: "auto" }}>
                {coach.coachMessageSource === "ai" ? "AI written" : "Computed from your data"}
              </span>
            </div>
            <p style={{ fontSize: 13.5, color: "var(--sc-ink-2)", lineHeight: 1.75, margin: 0 }}>
              {clean(coach.coachMessage)}
            </p>
          </div>
        )}

        {/* Insights */}
        {insights.length > 0 && (
          <div className="sc-card" style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
              <CircleDollarSign size={13} style={{ color: "var(--sc-accent)" }} />
              <h3 className="sc-h2">What we found</h3>
              <span className="sc-chip" style={{ marginLeft: "auto" }}>{insights.length} findings</span>
            </div>
            <div className="sc-grid">
              {insights.map((insight, i) => {
                const tone = TONE[insight.tone] || TONE.info;
                const ToneIcon = tone.Icon;
                return (
                  <div className="sc-insight" key={i}>
                    <ToneIcon size={15} style={{ color: tone.color, flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div className="sc-insight-title">{insight.title}</div>
                      <div className="sc-insight-detail">{insight.detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="sc-card">
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
              <Zap size={13} style={{ color: "var(--sc-accent)" }} />
              <h3 className="sc-h2">What to do about it</h3>
              <span className="sc-chip" style={{ marginLeft: "auto" }}>Ranked by monthly impact</span>
            </div>

            {recommendations.map((rec, i) => (
              <div className="sc-rec" key={i}>
                <div className="sc-rank">{rec.priority ?? i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="sc-rec-head">
                    <span className="sc-rec-action">{clean(rec.action)}</span>
                    {rec.prerequisite && <span className="sc-chip sc-chip-first">Do this first</span>}
                    {rec.effort && <span className="sc-chip">{EFFORT[rec.effort] || rec.effort}</span>}
                    {rec.source === "ai" && <span className="sc-chip">AI suggestion</span>}
                  </div>
                  {rec.rationale && <div className="sc-rec-why">{clean(rec.rationale)}</div>}
                  {rec.evidence && <div className="sc-rec-evidence">{rec.evidence}</div>}
                </div>
                {rec.impactPerMonth > 0 && (
                  <div className="sc-impact">
                    {rupees(rec.impactPerMonth)}
                    <span className="sc-impact-unit">per month</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="sc-footer">
          {coverage.months != null && (
            <span>{coverage.months} complete month{coverage.months === 1 ? "" : "s"} analysed</span>
          )}
          {coverage.transactions != null && <span>{coverage.transactions} transactions</span>}
          {coverage.confidence && <span>Confidence: {coverage.confidence}</span>}
          {coverage.uncategorisedShare > 0 && (
            <span>{Math.round(coverage.uncategorisedShare)}% uncategorised</span>
          )}
        </div>
      </div>
    </>
  );
}

export default SpendingCoachPage;
