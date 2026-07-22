import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Wallet, CreditCard, Plus, Edit2, Trash2, Check, X, ArrowRight, Info } from "lucide-react";

// Theme-token based (var(--text-primary) etc.) so light mode works without the
// !important patch layer in index.css — inline hex colors can't be themed.
// Font inherits from the app; the old per-page DM Sans @import was a render-
// blocking fetch that made this one page's typography differ from the rest.
const CSS = `
  .nwm * { box-sizing: border-box; }
  .nwm-card { background: var(--bg-card); border: 1px solid var(--border-card); border-radius: 20px; padding: 24px; margin-bottom: 16px; position: relative; overflow: hidden; }
  .nwm-card::after { content:''; position:absolute; top:0; left:0; right:0; height:1px; background:linear-gradient(90deg,transparent,rgba(148,163,184,0.15),transparent); }
  .nwm-input { width:100%; background:var(--bg-input, rgba(255,255,255,0.04)); border:1px solid var(--border-subtle, rgba(255,255,255,0.09)); border-radius:11px; padding:10px 14px; color:var(--text-primary); font-size:13px; outline:none; font-family:inherit; transition:border-color 0.2s; }
  .nwm-input:focus { border-color:rgba(167,139,250,0.5); }
  .nwm-input::placeholder { color:var(--text-muted, rgba(100,116,139,0.5)); }
  .nwm-select { width:100%; background:var(--bg-input, rgba(255,255,255,0.04)); border:1px solid var(--border-subtle, rgba(255,255,255,0.09)); border-radius:11px; padding:10px 14px; color:var(--text-primary); font-size:13px; outline:none; font-family:inherit; cursor:pointer; }
  .nwm-select:focus { border-color:rgba(167,139,250,0.5); }
  .nwm-btn { display:inline-flex; align-items:center; gap:7px; padding:9px 18px; border-radius:10px; border:none; font-size:12px; font-weight:700; cursor:pointer; transition:all 0.2s; letter-spacing:0.03em; font-family:inherit; }
  .nwm-btn:hover { opacity:0.88; transform:translateY(-1px); }
  .nwm-btn:disabled { opacity:0.4; cursor:not-allowed; transform:none; }
  .nwm-row { display:flex; align-items:center; justify-content:space-between; padding:13px 16px; border-radius:12px; background:var(--bg-subtle); border:1px solid var(--border-card); transition:all 0.2s; margin-bottom:8px; }
  .nwm-row:hover { border-color:var(--border-card-hover); }
  .nwm-icon-btn { display:flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:8px; border:none; cursor:pointer; transition:all 0.2s; font-family:inherit; }
  .nwm-icon-btn:hover { transform:scale(1.08); }
  .stat-card { background:var(--bg-card); border:1px solid var(--border-card); border-radius:16px; padding:20px; position:relative; overflow:hidden; transition:all 0.25s; }
  .stat-card:hover { border-color:var(--border-card-hover); transform:translateY(-2px); }
  .stat-card::after { content:''; position:absolute; top:0; left:0; right:0; height:1px; background:linear-gradient(90deg,transparent,rgba(148,163,184,0.15),transparent); }
  .nwm-stat-grid { display: grid; grid-template-columns: 1.3fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 24px; }
  @media (max-width: 640px) {
    .nwm-stat-grid { grid-template-columns: 1fr 1fr; }
    .nwm-row { flex-wrap: wrap; gap: 10px; }
    .nwm-row > div:first-child { width: 100%; }
    .nwm-row > div:last-child { width: 100%; flex-shrink: 1; justify-content: flex-start; gap: 10px; }
  }
`;

// Asset types that belong in the Investment Portfolio page — not allowed here
const INVESTMENT_TYPES = new Set([
  "stocks", "stock", "mutual fund", "mutual funds", "mf",
  "fixed deposit", "fd", "gold", "ppf", "nps", "bonds", "bond",
  "crypto", "cryptocurrency", "investment", "investments",
]);

const isInvestmentType = (type) =>
  type ? INVESTMENT_TYPES.has(type.toLowerCase().trim()) : false;

// Allowed asset types for this page. "Savings Account" / "Emergency Fund" are
// deliberately absent: assets with those types counted toward Total Assets
// while the Savings card ignored them, so the page contradicted itself.
// Cash savings belong to the Savings figure, not this list.
const ASSET_TYPES = [
  "Real Estate",
  "Property",
  "Vehicle",
  "Jewellery",
  "Fixed Assets",
  "Provident Fund",
  "Other",
];

const LIABILITY_TYPES = [
  "Home Loan",
  "Car Loan",
  "Personal Loan",
  "Student Loan",
  "Credit Card",
  "Business Loan",
  "Medical Debt",
  "Other",
];

// Animates the magnitude and renders the sign as a proper minus prefix —
// a negative value (e.g. savings after an overspent quarter) used to skip the
// animation entirely and print "₹-12,000".
function AnimatedNumber({ value = 0, duration = 1000 }) {
  const [d, setD] = useState(0);
  useEffect(() => {
    const target = Math.abs(value);
    let s = 0; const step = target / (duration / 16);
    const t = setInterval(() => {
      s += step;
      if (s >= target) { setD(target); clearInterval(t); } else setD(Math.floor(s));
    }, 16);
    return () => clearInterval(t);
  }, [value, duration]);
  return <span>{value < 0 && "−"}₹{Math.round(d).toLocaleString("en-IN")}</span>;
}

const gotoSection = (name) => {
  localStorage.setItem("activeSection", name);
  window.dispatchEvent(new Event("dashboardNav"));
};

// Weighs a single liability against the user's savings and, when no
// structured repayment plan (EMI + term) has been recorded, advises whether
// it is small enough relative to savings to clear outright versus large
// enough that it warrants a formal, tracked repayment schedule.
const PAYOFF_THRESHOLD_PCT = 35;

function getLiabilityInsight(liability, savings) {
  const amount = liability?.amount || 0;
  const hasEmi  = Boolean(liability?.emi);
  const hasTerm = Boolean(liability?.termMonths);

  if (!savings || savings <= 0) {
    return {
      tone: "neutral",
      headline: "No positive savings to compare against",
      message:
        "Your savings figure isn't positive right now — either no balance is on record or recent spending exceeded income — so this liability can't be weighed against it. Once your savings turn positive, a personalised repayment recommendation appears here.",
    };
  }

  const pct = (amount / savings) * 100;
  const pctLabel = pct < 1 ? "under 1%" : `${Math.round(pct)}%`;

  if (hasEmi && hasTerm) {
    return {
      tone: "info",
      pct,
      headline: `EMI plan in place — ${pctLabel} of savings`,
      message: `This liability equals ${pctLabel} of your total savings. You've already set up a monthly EMI of ₹${liability.emi.toLocaleString("en-IN")} over ${liability.termMonths} months, so continue following that repayment schedule — it's the most cost-effective way to retire this debt.`,
    };
  }

  if (hasEmi && !hasTerm) {
    return {
      tone: "info",
      pct,
      headline: `Add the remaining term — ${pctLabel} of savings`,
      message: `This liability equals ${pctLabel} of your total savings. You've set a monthly EMI of ₹${liability.emi.toLocaleString("en-IN")}, but no repayment term is on record. Add the remaining months so we can confirm your full payoff timeline and total interest outlay.`,
    };
  }

  if (!hasEmi && hasTerm) {
    return {
      tone: "info",
      pct,
      headline: `Add the EMI amount — ${pctLabel} of savings`,
      message: `This liability equals ${pctLabel} of your total savings. You've recorded a repayment term of ${liability.termMonths} months, but no monthly EMI amount. Add the EMI so we can confirm this liability is on track to be fully repaid within that window.`,
    };
  }

  if (pct < PAYOFF_THRESHOLD_PCT) {
    return {
      tone: "good",
      pct,
      headline: `Manageable — ${pctLabel} of savings, consider clearing early`,
      message: `This liability equals only ${pctLabel} of your total savings — a manageable share. Since no EMI or repayment term is set, we recommend paying it off in full as early as you comfortably can. Clearing it now will save you from accumulating avoidable interest and will immediately strengthen your net worth.`,
    };
  }

  return {
    tone: "warning",
    pct,
    headline: `Large — ${pctLabel} of savings, set up an EMI plan`,
    message: `This liability equals ${pctLabel} of your total savings — a substantial share that isn't advisable to clear in one go. Rather than draining your savings, set up a monthly EMI with a defined repayment term. A structured plan protects your emergency buffer while steadily reducing the debt.`,
  };
}

function NetWorthManagement({
  netWorth, assets = [], liabilities = [],
  createAsset, updateAsset, deleteAsset,
  createLiability, updateLiability, deleteLiability,
}) {
  const [assetName,   setAssetName]   = useState("");
  const [assetAmount, setAssetAmount] = useState("");
  const [assetType,   setAssetType]   = useState(ASSET_TYPES[0]);
  const [liabilityName,   setLiabilityName]   = useState("");
  const [liabilityAmount, setLiabilityAmount] = useState("");
  const [liabilityType,   setLiabilityType]   = useState(LIABILITY_TYPES[0]);
  // Optional loan details — providing an EMI activates the payment-based
  // debt-to-income assessment in the credit score.
  const [liabilityEmi,    setLiabilityEmi]    = useState("");
  const [liabilityRate,   setLiabilityRate]   = useState("");
  const [liabilityTerm,   setLiabilityTerm]   = useState("");
  const [editingAssetId,     setEditingAssetId]     = useState(null);
  const [editingLiabilityId, setEditingLiabilityId] = useState(null);
  const [editName,   setEditName]   = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editType,   setEditType]   = useState("");
  const [editEmi,    setEditEmi]    = useState("");
  const [editRate,   setEditRate]   = useState("");
  const [editTerm,   setEditTerm]   = useState("");
  const [addingAsset,     setAddingAsset]     = useState(false);
  const [addingLiability, setAddingLiability] = useState(false);
  const [openInsightId,   setOpenInsightId]   = useState(null);

  // The asset and liability editors share the edit* fields, so opening one
  // must close the other — with both open they typed into each other.
  const startAssetEdit = (asset) => {
    setEditingLiabilityId(null);
    setEditingAssetId(asset.id);
    setEditName(asset.name); setEditAmount(asset.amount); setEditType(asset.type);
  };
  const startLiabilityEdit = (liability) => {
    setEditingAssetId(null);
    setEditingLiabilityId(liability.id);
    setEditName(liability.name); setEditAmount(liability.amount); setEditType(liability.type);
    setEditEmi(liability.emi ?? ""); setEditRate(liability.interestRate ?? ""); setEditTerm(liability.termMonths ?? "");
  };

  const isHealthy      = (netWorth?.netWorth || 0) >= 0;
  const totalAssets    = netWorth?.totalAssets || 0;
  const totalLiabilities = netWorth?.totalLiabilities || 0;
  const savings        = netWorth?.savings || 0;
  const portfolioValue = netWorth?.portfolioCurrentValue || 0;
  const portfolioPnl   = netWorth?.portfolioPnl || 0;
  const portfolioCount = netWorth?.portfolioCount || 0;
  const totalWealth    = totalAssets + portfolioValue + (netWorth?.savings || 0);
  // Clamped: negative savings can drag totalWealth below zero, and a raw
  // negative percentage renders as an invalid bar width.
  const assetPct       = totalWealth + totalLiabilities > 0
    ? Math.min(100, Math.max(0, Math.round((totalWealth / (totalWealth + totalLiabilities)) * 100))) : 0;

  // Only show non-investment, non-savings assets in this list
  const displayAssets = assets.filter(
    (a) => a.type !== "ManualSavings" && !isInvestmentType(a.type)
  );

  // If user has legacy investment-type assets in the DB, collect them for info
  const legacyInvestmentAssets = assets.filter(
    (a) => a.type !== "ManualSavings" && isInvestmentType(a.type)
  );

  // Crore-scale amounts overflowed the fixed 32px stat type and got clipped —
  // size down as digit count grows instead of truncating money.
  const fitAmount = (value, base, mid, small) => {
    const abs = Math.abs(value || 0);
    if (abs >= 1e9) return small;
    if (abs >= 1e7) return mid;
    return base;
  };

  const assetIcon = (type) => {
    const t = (type || "").toLowerCase();
    if (t.includes("real") || t.includes("property")) return "🏠";
    if (t.includes("vehicle") || t.includes("car"))   return "🚗";
    if (t.includes("jewel"))                           return "💍";
    if (t.includes("saving"))                          return "🏦";
    return "💼";
  };

  const liabilityIcon = (type) => {
    const t = (type || "").toLowerCase();
    if (t.includes("home") || t.includes("mortgage")) return "🏠";
    if (t.includes("car"))                            return "🚗";
    if (t.includes("student"))                        return "🎓";
    if (t.includes("credit"))                         return "💳";
    return "💳";
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="nwm">

        {/* Page Header */}
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
          <div style={{ width:40, height:40, borderRadius:12, background:"linear-gradient(135deg,rgba(167,139,250,0.25),rgba(34,211,238,0.15))", border:"1px solid rgba(167,139,250,0.3)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Wallet size={18} color="#a78bfa"/>
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:"var(--text-dim)", letterSpacing:"0.1em" }}>WEALTH MANAGEMENT</div>
            <h1 style={{ fontSize:22, fontWeight:700, color:"var(--text-primary)", margin:0, letterSpacing:"-0.02em" }}>Net Worth</h1>
          </div>
          <span style={{ marginLeft:"auto", padding:"6px 14px", borderRadius:10, fontSize:12, fontWeight:700,
            color:isHealthy?"#4ade80":"#f87171",
            background:isHealthy?"rgba(74,222,128,0.1)":"rgba(248,113,113,0.1)",
            border:`1px solid ${isHealthy?"rgba(74,222,128,0.25)":"rgba(248,113,113,0.25)"}` }}>
            {isHealthy ? "✓ Healthy" : "⚠ Negative"}
          </span>
        </div>

        {/* Summary Strip */}
        <div className="nwm-stat-grid">
          <div className="stat-card">
            <div style={{ position:"absolute", bottom:0, left:0, right:0, height:2, background:`linear-gradient(90deg,transparent,${isHealthy?"#4ade80":"#f87171"}50,transparent)` }}/>
            <div style={{ fontSize:10, fontWeight:700, color:"var(--text-dim)", letterSpacing:"0.12em", marginBottom:10 }}>NET WORTH</div>
            <div style={{ fontSize:fitAmount(netWorth?.netWorth, 32, 25, 21), fontWeight:800, color:"var(--text-primary)", letterSpacing:"-0.04em", fontVariantNumeric:"tabular-nums", whiteSpace:"nowrap" }}>
              {(netWorth?.netWorth||0)<0 && <span style={{ color:"#f87171" }}>−</span>}
              <AnimatedNumber value={Math.abs(netWorth?.netWorth||0)} duration={1200}/>
            </div>
            <div style={{ marginTop:12, display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ flex:1, height:5, background:"var(--bg-subtle)", borderRadius:3, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${assetPct}%`, background:"linear-gradient(90deg,#4ade80,#22d3ee)", borderRadius:3, transition:"width 1.2s ease" }}/>
              </div>
              <span style={{ fontSize:10, color:"var(--text-dim)", whiteSpace:"nowrap" }}>{assetPct}% assets</span>
            </div>
          </div>

          {[
            { label:"TOTAL ASSETS",  value:totalAssets + portfolioValue, color:"#4ade80", icon:<TrendingUp size={13} color="#4ade80"/>,   dur:900 },
            { label:"SAVINGS",       value:netWorth?.savings||0,         color:"#22d3ee", icon:<Wallet size={13} color="#22d3ee"/>,        dur:1050 },
            { label:"LIABILITIES",   value:totalLiabilities,             color:"#f87171", icon:<TrendingDown size={13} color="#f87171"/>,  dur:1100 },
          ].map((s) => (
            <div key={s.label} className="stat-card">
              <div style={{ position:"absolute", bottom:0, left:0, right:0, height:2, background:`linear-gradient(90deg,transparent,${s.color}40,transparent)` }}/>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <span style={{ fontSize:10, fontWeight:700, color:"var(--text-dim)", letterSpacing:"0.1em" }}>{s.label}</span>
                <div style={{ width:24, height:24, borderRadius:7, background:s.color+"18", border:`1px solid ${s.color}30`, display:"flex", alignItems:"center", justifyContent:"center" }}>{s.icon}</div>
              </div>
              <div style={{ fontSize:fitAmount(s.value, 20, 16, 14), fontWeight:800, color:s.color, fontVariantNumeric:"tabular-nums", whiteSpace:"nowrap" }}>
                <AnimatedNumber value={s.value} duration={s.dur}/>
              </div>
            </div>
          ))}
        </div>

        {/* Legacy investment assets warning */}
        {legacyInvestmentAssets.length > 0 && (
          <div style={{ background:"rgba(251,191,36,0.06)", border:"1px solid rgba(251,191,36,0.2)", borderRadius:14, padding:"14px 18px", marginBottom:16, display:"flex", gap:12, alignItems:"flex-start" }}>
            <Info size={16} color="#fbbf24" style={{ flexShrink:0, marginTop:1 }}/>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#fbbf24", marginBottom:4 }}>
                {legacyInvestmentAssets.length} investment-type asset{legacyInvestmentAssets.length>1?"s":""} found here
              </div>
              <div style={{ fontSize:12, color:"rgba(251,191,36,0.7)", lineHeight:1.6 }}>
                <strong style={{ color:"rgba(251,191,36,0.9)" }}>{legacyInvestmentAssets.map(a=>a.name).join(", ")}</strong> — these are excluded from Total Assets to avoid double-counting with your Investment Portfolio. Please delete them here and re-add them in the Investments page with ticker codes for live price tracking.
              </div>
              <button onClick={()=>gotoSection("Investments")}
                style={{ marginTop:8, background:"rgba(251,191,36,0.12)", border:"1px solid rgba(251,191,36,0.25)", borderRadius:8, padding:"6px 12px", color:"#fbbf24", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit", display:"inline-flex", alignItems:"center", gap:5 }}>
                Go to Investments <ArrowRight size={11}/>
              </button>
            </div>
          </div>
        )}

        {/* ASSETS SECTION */}
        <div className="nwm-card">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:9, background:"rgba(74,222,128,0.12)", border:"1px solid rgba(74,222,128,0.2)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <TrendingUp size={14} color="#4ade80"/>
              </div>
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:"rgba(74,222,128,0.6)", letterSpacing:"0.1em" }}>WEALTH</div>
                <h2 style={{ fontSize:15, fontWeight:700, color:"var(--text-primary)", margin:0 }}>Assets</h2>
              </div>
              <span style={{ fontSize:11, fontWeight:700, color:"#4ade80", background:"rgba(74,222,128,0.1)", border:"1px solid rgba(74,222,128,0.2)", borderRadius:7, padding:"3px 10px" }}>
                {displayAssets.length} items
              </span>
            </div>
            <button className="nwm-btn" onClick={()=>setAddingAsset(!addingAsset)}
              style={{ background:"rgba(74,222,128,0.15)", color:"#4ade80", border:"1px solid rgba(74,222,128,0.25)" }}>
              <Plus size={14}/> Add Asset
            </button>
          </div>

          {/* Investment Portfolio read-only row */}
          {portfolioCount > 0 && (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"13px 16px", borderRadius:12, background:"rgba(245,158,11,0.06)", border:"1px solid rgba(245,158,11,0.18)", marginBottom:8 }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:36, height:36, borderRadius:10, background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }}>
                  📈
                </div>
                <div>
                  <p style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)", margin:0 }}>Investment Portfolio</p>
                  <p style={{ fontSize:11, color:"var(--text-dim)", margin:"2px 0 0" }}>
                    {portfolioCount} holding{portfolioCount!==1?"s":""} · {portfolioPnl>=0?"▲":"▼"} P&L ₹{Math.abs(Math.round(portfolioPnl)).toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:15, fontWeight:700, color:"#f59e0b", fontVariantNumeric:"tabular-nums" }}>
                  ₹{Math.round(portfolioValue).toLocaleString("en-IN")}
                </span>
                <button onClick={()=>gotoSection("Investments")}
                  style={{ display:"flex", alignItems:"center", gap:4, background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.2)", borderRadius:8, padding:"5px 10px", color:"#f59e0b", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                  Manage <ArrowRight size={11}/>
                </button>
              </div>
            </div>
          )}

          {/* Add asset form */}
          {addingAsset && (
            <div style={{ background:"rgba(74,222,128,0.05)", border:"1px solid rgba(74,222,128,0.15)", borderRadius:14, padding:16, marginBottom:16 }}>
              <div style={{ fontSize:10, fontWeight:700, color:"rgba(74,222,128,0.6)", letterSpacing:"0.08em", marginBottom:12 }}>NEW ASSET</div>

              {/* Info about investments */}
              <div style={{ display:"flex", gap:8, alignItems:"center", background:"rgba(167,139,250,0.06)", border:"1px solid rgba(167,139,250,0.15)", borderRadius:10, padding:"9px 12px", marginBottom:12 }}>
                <Info size={13} color="#a78bfa" style={{ flexShrink:0 }}/>
                <span style={{ fontSize:11, color:"rgba(167,139,250,0.8)" }}>
                  For stocks, mutual funds, gold, FD, PPF, NPS, bonds or crypto —&nbsp;
                  <span style={{ cursor:"pointer", textDecoration:"underline", fontWeight:700 }} onClick={()=>gotoSection("Investments")}>
                    use the Investments page
                  </span>
                  &nbsp;for live price tracking.
                </span>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(140px,100%), 1fr))", gap:10, marginBottom:12 }}>
                <input className="nwm-input" placeholder="Asset name (e.g. Home)" value={assetName} onChange={(e)=>setAssetName(e.target.value)}/>
                <input className="nwm-input" type="number" placeholder="Amount (₹)" value={assetAmount} onChange={(e)=>setAssetAmount(e.target.value)}/>
                <select className="nwm-select" value={assetType} onChange={(e)=>setAssetType(e.target.value)}>
                  {ASSET_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button className="nwm-btn" style={{ background:"rgba(74,222,128,0.2)", color:"#4ade80" }}
                  disabled={!assetName.trim() || !(Number(assetAmount) > 0)}
                  onClick={async()=>{
                    await createAsset({ name:assetName, amount:Number(assetAmount), type:assetType });
                    setAssetName(""); setAssetAmount(""); setAssetType(ASSET_TYPES[0]); setAddingAsset(false);
                  }}>
                  <Check size={13}/> Save Asset
                </button>
                <button className="nwm-btn" style={{ background:"var(--bg-subtle)", color:"var(--text-dim)" }} onClick={()=>setAddingAsset(false)}>
                  <X size={13}/> Cancel
                </button>
              </div>
            </div>
          )}

          {/* Asset list */}
          {displayAssets.length === 0 && !addingAsset && portfolioCount === 0 && (
            <div style={{ textAlign:"center", padding:"26px 0" }}>
              <div style={{ width:40, height:40, borderRadius:12, margin:"0 auto 10px", display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(74,222,128,0.08)", border:"1px solid rgba(74,222,128,0.18)", fontSize:17 }}>🏦</div>
              <div style={{ fontSize:13, fontWeight:700, color:"var(--text-primary)" }}>No assets yet</div>
              <div style={{ fontSize:12, color:"var(--text-dim)", marginTop:4, lineHeight:1.6, maxWidth:340, margin:"4px auto 0" }}>
                Add property, savings, vehicles or other holdings — they build the asset side of your net worth.
              </div>
            </div>
          )}

          {displayAssets.map((asset) => (
            <div key={asset.id}>
              {editingAssetId === asset.id ? (
                <div style={{ background:"var(--bg-subtle)", border:"1px solid var(--border-card)", borderRadius:12, padding:14, marginBottom:8 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(140px,100%), 1fr))", gap:10, marginBottom:10 }}>
                    <input className="nwm-input" value={editName} onChange={(e)=>setEditName(e.target.value)} placeholder="Name"/>
                    <input className="nwm-input" type="number" value={editAmount} onChange={(e)=>setEditAmount(e.target.value)} placeholder="Amount"/>
                    {/* Existing rows may carry retired types (e.g. "Savings
                        Account") — keep the current value selectable so editing
                        an old asset doesn't silently switch its type. */}
                    <select className="nwm-select" value={editType} onChange={(e)=>setEditType(e.target.value)}>
                      {(ASSET_TYPES.includes(editType) ? ASSET_TYPES : [editType, ...ASSET_TYPES])
                        .map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button className="nwm-btn" style={{ background:"rgba(74,222,128,0.2)", color:"#4ade80" }}
                      disabled={!String(editName).trim() || !(Number(editAmount) > 0)}
                      onClick={async()=>{ await updateAsset(asset.id,{name:editName,amount:Number(editAmount),type:editType}); setEditingAssetId(null); }}>
                      <Check size={13}/> Save
                    </button>
                    <button className="nwm-btn" style={{ background:"var(--bg-subtle)", color:"var(--text-dim)" }} onClick={()=>setEditingAssetId(null)}>
                      <X size={13}/> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="nwm-row">
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:36, height:36, borderRadius:10, background:"rgba(74,222,128,0.1)", border:"1px solid rgba(74,222,128,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>
                      {assetIcon(asset.type)}
                    </div>
                    <div>
                      <p style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)", margin:0 }}>{asset.name}</p>
                      <p style={{ fontSize:11, color:"var(--text-dim)", margin:"2px 0 0" }}>{asset.type}</p>
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:15, fontWeight:700, color:"#4ade80", fontVariantNumeric:"tabular-nums" }}>
                      ₹{asset.amount?.toLocaleString("en-IN")}
                    </span>
                    <button className="nwm-icon-btn" title="Edit asset" style={{ background:"rgba(34,211,238,0.1)", color:"#22d3ee" }}
                      onClick={()=>startAssetEdit(asset)}>
                      <Edit2 size={12}/>
                    </button>
                    <button className="nwm-icon-btn" style={{ background:"rgba(248,113,113,0.1)", color:"#f87171" }} onClick={()=>deleteAsset(asset.id)}>
                      <Trash2 size={12}/>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Legacy investment assets — show but with delete-only action */}
          {legacyInvestmentAssets.map((asset) => (
            <div key={asset.id} className="nwm-row" style={{ borderColor:"rgba(251,191,36,0.15)", background:"rgba(251,191,36,0.03)", opacity:0.7 }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:36, height:36, borderRadius:10, background:"rgba(251,191,36,0.08)", border:"1px solid rgba(251,191,36,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>📉</div>
                <div>
                  <p style={{ fontSize:13, fontWeight:600, color:"var(--text-dim)", margin:0 }}>{asset.name}</p>
                  <p style={{ fontSize:11, color:"rgba(251,191,36,0.5)", margin:"2px 0 0" }}>{asset.type} · excluded from total (move to Investments)</p>
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:14, fontWeight:700, color:"var(--text-dim)", fontVariantNumeric:"tabular-nums", textDecoration:"line-through" }}>
                  ₹{asset.amount?.toLocaleString("en-IN")}
                </span>
                <button className="nwm-icon-btn" style={{ background:"rgba(248,113,113,0.1)", color:"#f87171" }} onClick={()=>deleteAsset(asset.id)}>
                  <Trash2 size={12}/>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* LIABILITIES SECTION */}
        <div className="nwm-card">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:9, background:"rgba(248,113,113,0.12)", border:"1px solid rgba(248,113,113,0.2)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <CreditCard size={14} color="#f87171"/>
              </div>
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:"rgba(248,113,113,0.6)", letterSpacing:"0.1em" }}>OBLIGATIONS</div>
                <h2 style={{ fontSize:15, fontWeight:700, color:"var(--text-primary)", margin:0 }}>Liabilities</h2>
              </div>
              <span style={{ fontSize:11, fontWeight:700, color:"#f87171", background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.2)", borderRadius:7, padding:"3px 10px" }}>
                {liabilities.length} items
              </span>
            </div>
            <button className="nwm-btn" onClick={()=>setAddingLiability(!addingLiability)}
              style={{ background:"rgba(248,113,113,0.12)", color:"#f87171", border:"1px solid rgba(248,113,113,0.22)" }}>
              <Plus size={14}/> Add Liability
            </button>
          </div>

          {/* Add liability form */}
          {addingLiability && (
            <div style={{ background:"rgba(248,113,113,0.05)", border:"1px solid rgba(248,113,113,0.15)", borderRadius:14, padding:16, marginBottom:16 }}>
              <div style={{ fontSize:10, fontWeight:700, color:"rgba(248,113,113,0.6)", letterSpacing:"0.08em", marginBottom:12 }}>NEW LIABILITY</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(140px,100%), 1fr))", gap:10, marginBottom:12 }}>
                <input className="nwm-input" placeholder="Liability name (e.g. Home Loan)" value={liabilityName} onChange={(e)=>setLiabilityName(e.target.value)}/>
                <input className="nwm-input" type="number" placeholder="Amount (₹)" value={liabilityAmount} onChange={(e)=>setLiabilityAmount(e.target.value)}/>
                <select className="nwm-select" value={liabilityType} onChange={(e)=>setLiabilityType(e.target.value)}>
                  {LIABILITY_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
                <input className="nwm-input" type="number" placeholder="Monthly EMI (₹, optional)" value={liabilityEmi} onChange={(e)=>setLiabilityEmi(e.target.value)}/>
                <input className="nwm-input" type="number" placeholder="Interest rate (% p.a., optional)" value={liabilityRate} onChange={(e)=>setLiabilityRate(e.target.value)}/>
                <input className="nwm-input" type="number" placeholder="Months remaining (optional)" value={liabilityTerm} onChange={(e)=>setLiabilityTerm(e.target.value)}/>
              </div>
              <p style={{ fontSize:11, color:"var(--text-dim)", margin:"0 0 12px" }}>
                Adding the EMI lets FinTwin assess your debt the way lenders do — monthly payments against monthly income.
              </p>
              <div style={{ display:"flex", gap:8 }}>
                <button className="nwm-btn" style={{ background:"rgba(248,113,113,0.18)", color:"#f87171" }}
                  disabled={!liabilityName.trim() || !(Number(liabilityAmount) > 0)}
                  onClick={async()=>{
                    await createLiability({
                      name: liabilityName,
                      amount: Number(liabilityAmount),
                      type: liabilityType,
                      emi: liabilityEmi ? Number(liabilityEmi) : null,
                      interestRate: liabilityRate ? Number(liabilityRate) : null,
                      termMonths: liabilityTerm ? Number(liabilityTerm) : null,
                    });
                    setLiabilityName(""); setLiabilityAmount(""); setLiabilityType(LIABILITY_TYPES[0]);
                    setLiabilityEmi(""); setLiabilityRate(""); setLiabilityTerm("");
                    setAddingLiability(false);
                  }}>
                  <Check size={13}/> Save Liability
                </button>
                <button className="nwm-btn" style={{ background:"var(--bg-subtle)", color:"var(--text-dim)" }} onClick={()=>setAddingLiability(false)}>
                  <X size={13}/> Cancel
                </button>
              </div>
            </div>
          )}

          {liabilities.length === 0 && !addingLiability && (
            <div style={{ textAlign:"center", padding:"26px 0" }}>
              <div style={{ width:40, height:40, borderRadius:12, margin:"0 auto 10px", display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(74,222,128,0.08)", border:"1px solid rgba(74,222,128,0.18)", fontSize:17 }}>🎉</div>
              <div style={{ fontSize:13, fontWeight:700, color:"var(--text-primary)" }}>No liabilities — debt free</div>
              <div style={{ fontSize:12, color:"var(--text-dim)", marginTop:4 }}>
                If you do carry a loan, recording its EMI improves your credit-score assessment.
              </div>
            </div>
          )}

          {liabilities.map((liability) => (
            <div key={liability.id}>
              {editingLiabilityId === liability.id ? (
                <div style={{ background:"var(--bg-subtle)", border:"1px solid var(--border-card)", borderRadius:10, padding:10, marginBottom:8 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(108px,100%), 1fr))", gap:7, marginBottom:8 }}>
                    <input className="nwm-input" style={{ padding:"7px 10px", fontSize:12 }} value={editName} onChange={(e)=>setEditName(e.target.value)} placeholder="Name"/>
                    <input className="nwm-input" style={{ padding:"7px 10px", fontSize:12 }} type="number" value={editAmount} onChange={(e)=>setEditAmount(e.target.value)} placeholder="Amount"/>
                    <select className="nwm-select" style={{ padding:"7px 10px", fontSize:12 }} value={editType} onChange={(e)=>setEditType(e.target.value)}>
                      {LIABILITY_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                    <input className="nwm-input" style={{ padding:"7px 10px", fontSize:12 }} type="number" value={editEmi} onChange={(e)=>setEditEmi(e.target.value)} placeholder="EMI (₹, optional)"/>
                    <input className="nwm-input" style={{ padding:"7px 10px", fontSize:12 }} type="number" value={editRate} onChange={(e)=>setEditRate(e.target.value)} placeholder="Rate (% p.a., optional)"/>
                    <input className="nwm-input" style={{ padding:"7px 10px", fontSize:12 }} type="number" value={editTerm} onChange={(e)=>setEditTerm(e.target.value)} placeholder="Months left (optional)"/>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <button className="nwm-btn" style={{ background:"rgba(74,222,128,0.2)", color:"#4ade80", padding:"7px 14px", fontSize:11 }}
                      disabled={!String(editName).trim() || !(Number(editAmount) > 0)}
                      onClick={async()=>{
                        await updateLiability(liability.id,{
                          name:editName, amount:Number(editAmount), type:editType,
                          emi: editEmi ? Number(editEmi) : null,
                          interestRate: editRate ? Number(editRate) : null,
                          termMonths: editTerm ? Number(editTerm) : null,
                        });
                        setEditingLiabilityId(null);
                      }}>
                      <Check size={12}/> Save
                    </button>
                    <button className="nwm-btn" style={{ background:"var(--bg-subtle)", color:"var(--text-dim)", padding:"7px 14px", fontSize:11 }} onClick={()=>setEditingLiabilityId(null)}>
                      <X size={12}/> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="nwm-row">
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:36, height:36, borderRadius:10, background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>
                      {liabilityIcon(liability.type)}
                    </div>
                    <div>
                      <p style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)", margin:0 }}>{liability.name}</p>
                      <p style={{ fontSize:11, color:"var(--text-dim)", margin:"2px 0 0" }}>{liability.type}</p>
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", width:"100%" }}>
                    <span style={{ fontSize:15, fontWeight:700, color:"#f87171", fontVariantNumeric:"tabular-nums" }}>
                      ₹{liability.amount?.toLocaleString("en-IN")}
                    </span>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <button
                        className="nwm-btn"
                        title="Mark this liability as fully paid off and remove it from your obligations"
                        style={{ background:"rgba(74,222,128,0.12)", color:"#16a34a", border:"1px solid rgba(74,222,128,0.3)", padding:"5px 9px", fontSize:10.5 }}
                        onClick={()=>deleteLiability(liability.id)}
                      >
                        <Check size={11}/> Paid Off
                      </button>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginLeft:8 }}>
                        <button className="nwm-icon-btn" title="Edit liability" style={{ background:"rgba(34,211,238,0.1)", color:"#22d3ee" }}
                          onClick={()=>startLiabilityEdit(liability)}>
                          <Edit2 size={12}/>
                        </button>
                        <button className="nwm-icon-btn" style={{ background:"rgba(248,113,113,0.1)", color:"#f87171" }} onClick={()=>deleteLiability(liability.id)}>
                          <Trash2 size={12}/>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Collapsed one-liner per row; the full paragraph expands on
                  click. The old always-open boxes drowned the list, and their
                  dark-on-tint text was unreadable in dark mode — accent colours
                  now carry the tone while the text stays theme-native. */}
              {editingLiabilityId !== liability.id && (() => {
                const insight = getLiabilityInsight(liability, savings);
                const accent = {
                  good: "#4ade80", warning: "#fbbf24", info: "#22d3ee", neutral: "#94a3b8",
                }[insight.tone];
                const expanded = openInsightId === liability.id;

                return (
                  <div
                    role="button"
                    onClick={() => setOpenInsightId(expanded ? null : liability.id)}
                    style={{
                      background:`${accent}10`, border:`1px solid ${accent}30`,
                      borderRadius:10, padding:"8px 12px", marginTop:-2, marginBottom:10,
                      cursor:"pointer",
                    }}
                  >
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <Info size={13} color={accent} style={{ flexShrink:0 }}/>
                      <span style={{ fontSize:11.5, fontWeight:600, color:accent, flex:1 }}>
                        {insight.headline}
                      </span>
                      <span style={{ fontSize:10, color:"var(--text-dim)", flexShrink:0 }}>
                        {expanded ? "hide" : "why?"}
                      </span>
                    </div>
                    {expanded && (
                      <p style={{ fontSize:11.5, lineHeight:1.6, fontWeight:500, color:"var(--text-primary)", margin:"8px 0 0", opacity:0.85 }}>
                        {insight.message}
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>

      </div>
    </>
  );
}

export default NetWorthManagement;
