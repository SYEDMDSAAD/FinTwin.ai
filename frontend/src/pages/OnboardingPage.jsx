import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import toast from "react-hot-toast";
import {
  CheckCircle, Sparkles, ChevronRight, Building2, Plus, RefreshCw,
  Shield, Brain, Bell, Wallet, TrendingUp, ShoppingCart,
  BarChart3, PiggyBank, Edit2, Lock
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const STEP_LABELS = ["Security", "Bank", "Profile", "Goals", "AI Setup", "Review"];

const GOAL_ICONS  = { "Emergency Fund":"🛡️", "Travel":"✈️", "Buy a Car":"🚗", "House":"🏠", "Education":"🎓", "Retirement":"🌅" };
const GOALS       = ["Emergency Fund", "Travel", "Buy a Car", "House", "Education", "Retirement"];

const LOADING_STEPS = [
  "Saving your profile",
  "Calculating Financial Score",
  "Building Forecast",
  "Preparing Spending Coach",
  "Creating Goals",
  "Generating Investment Strategy",
];

const AI_MODES = [
  { id: "Savings Advisor",    icon: "🐷", desc: "Optimise your savings rate and build an emergency fund" },
  { id: "Investment Advisor", icon: "📈", desc: "Grow wealth through smart investment recommendations" },
  { id: "Budget Coach",       icon: "📊", desc: "Stay on track with personalised budget management" },
  { id: "Fraud Analyst",      icon: "🔍", desc: "Detect suspicious patterns and protect your finances" },
  { id: "Purchase Advisor",   icon: "🛒", desc: "Analyse affordability before any major purchase" },
];

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap');
  .ob-page * { box-sizing:border-box; }
  .ob-page { font-family:'DM Sans',system-ui,sans-serif; }

  .ob-input { width:100%; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.09); border-radius:13px; padding:13px 16px; color:#e2e8f0; font-size:14px; outline:none; font-family:inherit; transition:all 0.2s; }
  .ob-input:focus { border-color:rgba(167,139,250,0.45); box-shadow:0 0 0 3px rgba(167,139,250,0.07); }
  .ob-input::placeholder { color:rgba(100,116,139,0.4); }
  .ob-input::-webkit-inner-spin-button { -webkit-appearance:none; }

  .goal-chip { padding:9px 18px; border-radius:100px; border:1px solid rgba(255,255,255,0.09); background:rgba(255,255,255,0.03); color:rgba(148,163,184,0.7); font-size:13px; font-weight:500; cursor:pointer; transition:all 0.2s; font-family:inherit; }
  .goal-chip:hover { border-color:rgba(167,139,250,0.3); color:#e2e8f0; background:rgba(167,139,250,0.06); }
  .goal-chip.active { background:rgba(167,139,250,0.18); border-color:rgba(167,139,250,0.45); color:#fff; font-weight:700; }

  .ai-mode-card { padding:14px 16px; border-radius:14px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.02); cursor:pointer; transition:all 0.15s; display:flex; align-items:center; gap:14px; }
  .ai-mode-card:hover:not(.selected) { background:rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.14); }
  .ai-mode-card.selected { background:rgba(167,139,250,0.1); border-color:rgba(167,139,250,0.4); }

  .ob-toggle { width:46px; height:26px; border-radius:99px; border:none; cursor:pointer; position:relative; transition:background 0.3s; flex-shrink:0; }
  .ob-toggle-thumb { position:absolute; top:3px; width:20px; height:20px; border-radius:50%; background:#fff; transition:transform 0.3s; box-shadow:0 2px 6px rgba(0,0,0,0.3); }

  .otp-box { width:44px; height:52px; border-radius:12px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.09); color:#e2e8f0; font-size:20px; font-weight:700; text-align:center; outline:none; font-family:inherit; transition:all 0.2s; }
  .otp-box:focus { border-color:rgba(167,139,250,0.5); box-shadow:0 0 0 3px rgba(167,139,250,0.07); }

  @keyframes obFade { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
  .ob-fade { animation:obFade 0.35s ease both; }

  @keyframes loadingPulse { 0%,100%{opacity:0.4} 50%{opacity:1} }
  .loading-step { animation:loadingPulse 1.5s ease infinite; }

  @keyframes spin { to { transform:rotate(360deg); } }
  .spin { animation:spin 1.2s linear infinite; display:block; }

  @keyframes syncDot { 0%,80%,100%{transform:scale(0);opacity:0.3} 40%{transform:scale(1);opacity:1} }
  .sync-dot:nth-child(1){animation:syncDot 1.4s ease infinite 0s}
  .sync-dot:nth-child(2){animation:syncDot 1.4s ease infinite 0.2s}
  .sync-dot:nth-child(3){animation:syncDot 1.4s ease infinite 0.4s}

  @keyframes shieldGlow { 0%,100%{opacity:0.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.05)} }
  .shield-glow { animation:shieldGlow 3s ease infinite; }

  @keyframes bounceDot { 0%,80%,100%{transform:scale(0)} 40%{transform:scale(1)} }

  .ob-breadcrumb-bar { display:flex; align-items:center; justify-content:space-between; padding:0 48px; height:56px; border-bottom:1px solid rgba(255,255,255,0.06); position:sticky; top:0; background:rgba(8,10,15,0.95); backdrop-filter:blur(20px); z-index:10; }
  @media(max-width:640px) { .ob-breadcrumb-bar { padding:0 16px; overflow-x:auto; } }

  .ob-grid { display:grid; grid-template-columns:1fr 360px; gap:48px; padding:48px 48px; max-width:1140px; margin:0 auto; }
  @media(max-width:900px) { .ob-grid { grid-template-columns:1fr; } .ob-right-panel { display:none!important; } }
  @media(max-width:640px) { .ob-grid { padding:32px 20px; } }

  .review-card { background:rgba(255,255,255,0.025); border:1px solid rgba(255,255,255,0.07); border-radius:16px; padding:18px 20px; position:relative; }
  .review-card-edit { position:absolute; top:14px; right:16px; font-size:12px; font-weight:600; color:#a78bfa; background:none; border:none; cursor:pointer; font-family:inherit; display:flex; align-items:center; gap:5px; }
  .review-card-edit:hover { color:#c4b5fd; }
`;

// ── Breadcrumb ─────────────────────────────────────────────────────────────────

function Breadcrumb({ step, onNavigate }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {STEP_LABELS.map((label, i) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={() => i < step && onNavigate(i)}
            style={{
              background: "none", border: "none", padding: "4px 6px", borderRadius: 8,
              cursor: i < step ? "pointer" : "default",
              fontSize: 13,
              fontWeight: i === step ? 700 : 500,
              color: i === step ? "#e2e8f0" : i < step ? "#a78bfa" : "rgba(148,163,184,0.35)",
              fontFamily: "inherit",
              textDecoration: i === step ? "underline" : "none",
              textUnderlineOffset: 3,
              transition: "color 0.15s",
            }}
          >
            {label}
          </button>
          {i < 5 && (
            <span style={{ fontSize: 12, color: "rgba(148,163,184,0.25)" }}>›</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Progress bar ───────────────────────────────────────────────────────────────

function ProgressBar({ step }) {
  return (
    <div style={{ height: 2, background: "rgba(255,255,255,0.06)" }}>
      <div
        style={{
          height: "100%",
          width: `${(step / 5) * 100}%`,
          background: "linear-gradient(90deg,#a78bfa,#22d3ee)",
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}

// ── Right panel ambient visuals ────────────────────────────────────────────────

function SecurityPanel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 24 }}>
      <div className="shield-glow" style={{ position: "relative" }}>
        <div style={{
          width: 160, height: 160, borderRadius: "50%",
          background: "radial-gradient(circle,rgba(167,139,250,0.18) 0%,transparent 70%)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            width: 96, height: 96, borderRadius: "50%",
            background: "rgba(167,139,250,0.12)",
            border: "1px solid rgba(167,139,250,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 48px rgba(167,139,250,0.2)",
          }}>
            <Shield size={44} color="#a78bfa" />
          </div>
        </div>
      </div>
      <div style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(167,139,250,0.22)",
        borderRadius: 16,
        padding: "18px 22px",
        textAlign: "center",
        maxWidth: 280,
        boxShadow: "0 4px 24px rgba(167,139,250,0.10)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginBottom: 8 }}>
          <Lock size={13} color="#a78bfa" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", letterSpacing: "0.01em" }}>AES-256 Encrypted</span>
        </div>
        <div style={{ fontSize: 12, color: "rgba(148,163,184,0.6)", lineHeight: 1.65 }}>
          Every field in your financial profile is encrypted at rest. 2FA adds an extra layer of protection.
        </div>
      </div>
    </div>
  );
}

function BankPanel({ data }) {
  const nw        = data?.netWorth        || 0;
  const assets    = data?.totalAssets     || 0;
  const liabs     = data?.totalLiabilities|| 0;
  const isLoaded  = !!data;

  const fmt = v => `₹${Math.round(v).toLocaleString("en-IN")}`;

  // Pull depository vs investment from the assets list if available
  const assetList   = data?.assets   || [];
  const liabList    = data?.liabilities || [];

  const depository  = assetList.filter(a => a.type === "BANK" || a.type === "SAVINGS").reduce((s, a) => s + (a.value || 0), 0);
  const investments = assetList.filter(a => a.type === "INVESTMENT" || a.type === "MUTUAL_FUND" || a.type === "STOCK").reduce((s, a) => s + (a.value || 0), 0);
  const realEstate  = assetList.filter(a => a.type === "REAL_ESTATE" || a.type === "PROPERTY").reduce((s, a) => s + (a.value || 0), 0);
  const other       = assets - depository - investments - realEstate;

  return (
    <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 20, padding: "24px", transition: "all 0.4s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em" }}>LIVE SNAPSHOT</div>
        {isLoaded && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 100, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)", color: "#4ade80" }}>
            SYNCED
          </span>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "rgba(148,163,184,0.5)", marginBottom: 4 }}>Total net worth</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: isLoaded ? "#fff" : "rgba(255,255,255,0.2)", transition: "color 0.4s" }}>
          {isLoaded ? fmt(nw) : "Syncing…"}
        </div>
        {isLoaded && (
          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
            <span style={{ fontSize: 12, color: "#4ade80" }}>● Assets {fmt(assets)}</span>
            <span style={{ fontSize: 12, color: "#f87171" }}>● Debts {fmt(liabs)}</span>
          </div>
        )}
      </div>

      {[
        { label: "Depository",  val: isLoaded ? depository  : 0 },
        { label: "Investments", val: isLoaded ? investments : 0 },
        { label: "Real estate", val: isLoaded ? realEstate  : 0 },
        { label: "Other",       val: isLoaded ? Math.max(0, other) : 0 },
      ].map(r => (
        <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 12 }}>
          <span style={{ color: "rgba(148,163,184,0.6)" }}>{r.label}</span>
          <span style={{ color: isLoaded ? "rgba(255,255,255,0.7)" : "rgba(148,163,184,0.3)" }}>
            {isLoaded ? fmt(r.val) : "—"}
          </span>
        </div>
      ))}

      {!isLoaded && (
        <p style={{ fontSize: 11, color: "rgba(148,163,184,0.35)", marginTop: 12, textAlign: "center" }}>
          Real numbers appear once sync completes
        </p>
      )}
    </div>
  );
}

function ProfilePanel({ income, expenses }) {
  const savings = Math.max(0, (Number(income) || 0) - (Number(expenses) || 0));
  const rate    = income > 0 ? Math.round((savings / Number(income)) * 100) : 0;
  return (
    <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 20, padding: "24px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em", marginBottom: 16 }}>LIVE PREVIEW</div>
      {[
        { label: "Monthly Income",   value: income,   color: "#4ade80" },
        { label: "Monthly Expenses", value: expenses,  color: "#f87171" },
        { label: "Est. Savings",     value: String(savings), color: "#a78bfa" },
      ].map(r => (
        <div key={r.label} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "rgba(148,163,184,0.6)" }}>{r.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: r.color }}>
              ₹{Number(r.value || 0).toLocaleString("en-IN")}
            </span>
          </div>
          <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 99 }}>
            <div style={{
              height: "100%", borderRadius: 99,
              background: r.color,
              width: income ? `${Math.min(100, (Number(r.value || 0) / Number(income)) * 100)}%` : "0%",
              transition: "width 0.4s ease",
            }} />
          </div>
        </div>
      ))}
      {income > 0 && (
        <div style={{ background: rate >= 20 ? "rgba(74,222,128,0.07)" : "rgba(251,191,36,0.07)", border: `1px solid ${rate >= 20 ? "rgba(74,222,128,0.2)" : "rgba(251,191,36,0.2)"}`, borderRadius: 10, padding: "10px 14px", marginTop: 8 }}>
          <span style={{ fontSize: 12, color: "rgba(148,163,184,0.6)" }}>Savings rate </span>
          <span style={{ fontSize: 14, fontWeight: 800, color: rate >= 20 ? "#4ade80" : "#fbbf24" }}>{rate}%</span>
        </div>
      )}
    </div>
  );
}

function AIPanel({ aiModes }) {
  const selected = aiModes && aiModes.length > 0 ? aiModes : ["Savings Advisor"];
  const modeMap  = Object.fromEntries(AI_MODES.map(m => [m.id, m]));
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 20 }}>
      <div style={{
        width: 100, height: 100, borderRadius: "50%",
        background: "rgba(34,211,238,0.08)",
        border: "1px solid rgba(34,211,238,0.2)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 48px rgba(34,211,238,0.15)",
        fontSize: 44,
      }}>
        🧠
      </div>
      <div style={{ textAlign: "center", width: "100%" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 10 }}>
          {selected.map(id => (
            <span key={id} style={{ fontSize: 11, fontWeight: 700, color: "#22d3ee", background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: 8, padding: "3px 10px" }}>
              {modeMap[id]?.icon} {id}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "rgba(148,163,184,0.5)", lineHeight: 1.6 }}>
          Your AI will personalise responses based on the modes you select. You can change this anytime from Settings.
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const navigate = useNavigate();

  // ── Wizard state ─────────────────────────────────────────────────────────────
  const [step,         setStep]         = useState(() => { const s = sessionStorage.getItem("ob-step"); return s ? parseInt(s, 10) : 0; });
  const [isManualPath, setIsManualPath] = useState(() => sessionStorage.getItem("ob-manual") === "1");
  const [submitting,   setSubmitting]   = useState(false);

  // Persist step + manual path so page reloads don't reset the wizard
  useEffect(() => { sessionStorage.setItem("ob-step", step); }, [step]);
  useEffect(() => { sessionStorage.setItem("ob-manual", isManualPath ? "1" : "0"); }, [isManualPath]);

  // Step 0 — Security (2FA)
  const [otpCode,            setOtpCode]            = useState(["", "", "", "", "", ""]);
  const [qrData,             setQrData]             = useState(null);   // { qrCodeBase64, secret }
  const [qrLoading,          setQrLoading]          = useState(false);
  const [qrError,            setQrError]            = useState(false);  // API failed
  const [twoFaAlreadyOn,     setTwoFaAlreadyOn]     = useState(false);  // already enabled
  const [securing,           setSecuring]           = useState(false);
  const otpRefs = useRef([]);

  // Step 1 — Bank Connection
  const [mobile,          setMobile]          = useState("");
  const [mobileError,     setMobileError]     = useState("");
  const [bankConnecting,  setBankConnecting]  = useState(false);
  const [bankPhase,       setBankPhase]       = useState("connect"); // "connect" | "syncing"
  const [syncStatus,      setSyncStatus]      = useState("pending"); // pending | consented | synced
  const [syncMsg,         setSyncMsg]         = useState("Complete the bank consent in the other tab.");
  const [skipVisible,     setSkipVisible]     = useState(false);
  const [netWorthData,    setNetWorthData]    = useState(null);
  const [summaryData,     setSummaryData]     = useState(null);
  const pollRef           = useRef(null);
  const skipTimer         = useRef(null);
  const resyncTriggered   = useRef(false);
  const resyncRetryTimer  = useRef(null);

  // Step 2 — Financial Profile
  const [monthlyIncome,   setMonthlyIncome]   = useState("");
  const [monthlyExpenses, setMonthlyExpenses] = useState("");
  const [manualErrors,    setManualErrors]    = useState({});
  const [form,            setForm]            = useState({ savings: "", investments: "", debt: "" });

  // Step 3 — Goals
  const [goals, setGoals] = useState([]);

  // Step 4 — AI Setup
  const [aiModes,      setAiModes]      = useState(["Savings Advisor"]);
  const [dailyInsights,setDailyInsights]= useState(true);

  // ── Load 2FA QR on step 0 ─────────────────────────────────────────────────────
  const loadQR = async () => {
    setQrLoading(true);
    setQrError(false);
    try {
      const statusRes = await API.get("/2fa/status");
      if (statusRes.data.enabled) {
        setTwoFaAlreadyOn(true);          // already enabled — no QR needed
      } else {
        const setupRes = await API.post("/2fa/setup");
        setQrData(setupRes.data);
      }
    } catch {
      setQrError(true);
      toast.error("Couldn't load 2FA setup. Check your connection.");
    } finally {
      setQrLoading(false);
    }
  };

  useEffect(() => {
    if (step !== 0 || qrData || qrLoading || twoFaAlreadyOn) return;
    loadQR();
  }, [step]);

  // ── Fetch net worth + monthly summary once bank sync completes ───────────────
  useEffect(() => {
    if (syncStatus !== "synced") return;
    if (!netWorthData) {
      API.get("/net-worth").then(r => setNetWorthData(r.data)).catch(() => {});
    }
    if (!summaryData) {
      API.get("/analytics/monthly-summary").then(r => {
        setSummaryData(r.data);
        if (r.data.income   > 0) setMonthlyIncome(String(Math.round(r.data.income)));
        if (r.data.expenses > 0) setMonthlyExpenses(String(Math.round(r.data.expenses)));
      }).catch(() => {});
    }
  }, [syncStatus]);

  // ── Auto-detect existing bank connection when navigating back to step 1 ───────
  useEffect(() => {
    if (step !== 1 || bankPhase !== "connect") return;
    API.get("/bank/connections").then(res => {
      const conns = res.data || [];
      const synced   = conns.find(c => c.consentStatus === "ACTIVE" && c.lastSyncedAt);
      const fetching = conns.find(c => c.consentStatus === "FETCHING");
      const active   = conns.find(c => c.consentStatus === "ACTIVE");
      if (synced) {
        setIsManualPath(false);
        setBankPhase("syncing");
        setSyncStatus("synced");
        setSyncMsg("All transactions imported successfully!");
      } else if (fetching || active) {
        setIsManualPath(false);
        setBankPhase("syncing");
        setSyncStatus("consented");
        setSyncMsg("Fetching your transactions from the bank...");
      }
    }).catch(() => {});
  }, [step, bankPhase]);

  // ── Bank sync polling ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 1 || isManualPath || bankPhase !== "syncing" || syncStatus === "synced") return;

    skipTimer.current = setTimeout(() => setSkipVisible(true), 90_000);

    const doPoll = async () => {
      try {
        const res = await API.get("/bank/connections");
        const cs  = res.data || [];

        const synced   = cs.find(c => c.consentStatus === "ACTIVE" && c.lastSyncedAt);
        const fetching = cs.find(c => c.consentStatus === "FETCHING");
        const approved = cs.find(c => c.consentStatus === "ACTIVE");
        const pending  = cs.find(c => c.consentStatus === "PENDING");

        if (synced) { setSyncStatus("synced"); setSyncMsg("All transactions imported successfully!"); return; }

        // Backend is actively fetching — just update UI and wait, don't trigger
        // another resync (causes duplicate transactions when two sessions overlap)
        if (fetching) {
          setSyncStatus("consented");
          setSyncMsg("Fetching your transactions from the bank...");
          return;
        }

        // Consent approved but not synced yet — trigger resync once
        if (approved && !approved.lastSyncedAt && !resyncTriggered.current) {
          resyncTriggered.current = true;
          setSyncStatus("consented");
          setSyncMsg("Fetching your transactions from the bank...");
          API.post(`/bank/resync/${approved.id}`).catch(() => {});
          // 90s matches the skip-visible timeout so we never retry during a live session
          resyncRetryTimer.current = setTimeout(() => { resyncTriggered.current = false; }, 90_000);
          return;
        }

        if (pending && !resyncTriggered.current) {
          resyncTriggered.current = true;
          API.post("/bank/sync").catch(() => {});
          resyncRetryTimer.current = setTimeout(() => { resyncTriggered.current = false; }, 15_000);
        }
      } catch {}
    };

    doPoll();
    pollRef.current = setInterval(doPoll, 5_000);

    return () => {
      clearInterval(pollRef.current);
      clearTimeout(skipTimer.current);
      clearTimeout(resyncRetryTimer.current);
    };
  }, [step, isManualPath, bankPhase, syncStatus]);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleBankConnect = async () => {
    const cleaned = mobile.replace(/\D/g, "");
    if (cleaned.length !== 10) { setMobileError("Enter a valid 10-digit mobile number"); return; }
    setMobileError("");
    setBankConnecting(true);
    try {
      const res = await API.post("/bank/connect", { vua: `${cleaned}@onemoney` });
      const redirectUrl = res.data?.redirectUrl;
      if (redirectUrl) window.open(redirectUrl, "_blank");
      setIsManualPath(false);
      setBankPhase("syncing");
    } catch (err) {
      const msg = err.response?.data?.error || "Could not initiate bank connection. Try again or add manually.";
      toast.error(msg);
    } finally {
      setBankConnecting(false);
    }
  };

  const handleManualPath = () => {
    setIsManualPath(true);
    setStep(2);
  };

  const handleProfileContinue = () => {
    const errs = {};
    if (isManualPath) {
      if (!monthlyIncome   || Number(monthlyIncome)   <= 0) errs.income   = "Please enter your average monthly income";
      if (!monthlyExpenses || Number(monthlyExpenses) <= 0) errs.expenses = "Please enter your average monthly expenses";
    }
    setManualErrors(errs);
    if (Object.keys(errs).length === 0) setStep(3);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        savings:     Number(form.savings)     || 0,
        investments: Number(form.investments) || 0,
        debt:        Number(form.debt)        || 0,
        goals,
      };
      // Only send manual income/expense for the manual path — sending these for
      // bank users would trick the backend into thinking it's a manual onboarding
      // and overwrite real bank transactions with synthetic seeded data
      if (isManualPath) {
        if (monthlyIncome   && Number(monthlyIncome)   > 0) payload.incomeLast3Months   = Number(monthlyIncome)   * 3;
        if (monthlyExpenses && Number(monthlyExpenses) > 0) payload.expensesLast3Months = Number(monthlyExpenses) * 3;
      }
      // Store AI preferences locally
      localStorage.setItem("aiMode", JSON.stringify(aiModes));
      localStorage.setItem("dailyInsights", String(dailyInsights));
      // TODO: include aiMode/dailyInsights in payload when backend supports it

      await API.post("/onboarding/complete", payload);
      sessionStorage.removeItem("ob-step");
      sessionStorage.removeItem("ob-manual");
      toast.success("Welcome to FinTwin AI! Your financial profile is ready.", { duration: 5000 });
      setTimeout(() => navigate("/"), 3000);
    } catch {
      toast.error("Failed to create profile. Please try again.");
      setSubmitting(false);
    }
  };

  const toggleGoal = (g) => setGoals(p => p.includes(g) ? p.filter(x => x !== g) : [...p, g]);

  const handleSecureAccount = async () => {
    const code = otpCode.join("");
    if (code.length < 6) { toast.error("Enter the 6-digit code from your authenticator app"); return; }
    setSecuring(true);
    try {
      await API.post("/2fa/enable", { code });
      toast.success("2FA enabled! Your account is now secured.");
      setStep(1);
    } catch (err) {
      toast.error(err.response?.data?.error || "Invalid code. Try again.");
    } finally { setSecuring(false); }
  };

  const handleOTPChange = (index, value) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...otpCode]; next[index] = value; setOtpCode(next);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOTPKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otpCode[index] && index > 0) otpRefs.current[index - 1]?.focus();
  };

  const canContinueSync = syncStatus === "synced" || skipVisible;

  // ── Loading screen ────────────────────────────────────────────────────────────
  if (submitting) {
    return (
      <>
        <style>{CSS}</style>
        <div className="ob-page" style={{ minHeight: "100vh", background: "#080a0f", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ position: "fixed", top: "-10%", left: "-5%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,rgba(167,139,250,0.1) 0%,transparent 70%)", pointerEvents: "none" }} />
          <div style={{ width: "100%", maxWidth: 480, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 24, padding: "44px 40px", textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 28 }}>🧠</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>Building Your Financial Twin</h2>
            <p style={{ fontSize: 13, color: "rgba(148,163,184,0.5)", margin: "0 0 32px" }}>Personalizing your financial experience...</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {LOADING_STEPS.map((s, i) => (
                <div key={s} className="loading-step" style={{ animationDelay: `${i * 0.3}s`, display: "flex", alignItems: "center", gap: 10, background: "rgba(167,139,250,0.07)", border: "1px solid rgba(167,139,250,0.14)", borderRadius: 10, padding: "10px 14px", textAlign: "left" }}>
                  <CheckCircle size={14} color="#4ade80" />
                  <span style={{ fontSize: 12, color: "#d1d5db" }}>{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Page shell ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div className="ob-page" style={{ minHeight: "100vh", background: "#080a0f", position: "relative" }}>

        {/* Ambient glows */}
        <div style={{ position: "fixed", top: "-15%", left: "-5%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,rgba(167,139,250,0.08) 0%,transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "fixed", bottom: "-10%", right: "5%",  width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle,rgba(34,211,238,0.05) 0%,transparent 70%)",  pointerEvents: "none" }} />

        {/* ── Breadcrumb bar ── */}
        <div className="ob-breadcrumb-bar">
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginRight: 24 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg,#a78bfa,#22d3ee)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff" }}>F</div>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>FinTwin AI</span>
          </div>

          <Breadcrumb step={step} onNavigate={setStep} />

          <div style={{ flexShrink: 0, marginLeft: 24, fontSize: 11, color: "rgba(148,163,184,0.4)" }}>
            Step {step + 1} of 6
          </div>
        </div>

        {/* Progress bar */}
        <ProgressBar step={step} />

        {/* ── Content grid ── */}
        <div className="ob-grid">

          {/* Left: step content */}
          <div className="ob-fade" key={step}>

            {/* ══ STEP 0 — SECURITY ══ */}
            {step === 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(167,139,250,0.7)", letterSpacing: "0.1em", marginBottom: 8 }}>STEP 1 OF 6</div>
                <h1 style={{ fontSize: 30, fontWeight: 800, color: "#fff", margin: "0 0 8px", letterSpacing: "-0.02em" }}>Secure your financial twin</h1>
                <p style={{ fontSize: 14, color: "rgba(148,163,184,0.5)", margin: "0 0 32px", lineHeight: 1.7 }}>
                  Your data is protected with AES-256 encryption at rest. Adding 2FA means a one-time code is required every time you log in.
                </p>

                {/* 2FA setup card */}
                <div style={{ background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 18, overflow: "hidden", marginBottom: 16 }}>
                  <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(167,139,250,0.1)", display: "flex", alignItems: "center", gap: 12 }}>
                    <Shield size={16} color="#a78bfa" />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Set up 2FA with an authenticator app</span>
                  </div>
                  <div style={{ padding: "20px" }}>
                    {/* Steps */}
                    {[
                      "Open your authenticator app (Google Authenticator, Authy, etc.)",
                      "Tap + or Add account",
                      "Scan the QR code below or enter the setup key manually",
                    ].map((s, i) => (
                      <div key={s} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
                        <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#a78bfa", flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                        <span style={{ fontSize: 13, color: "rgba(148,163,184,0.7)", lineHeight: 1.5 }}>{s}</span>
                      </div>
                    ))}

                    {/* ── 2FA already active ── */}
                    {twoFaAlreadyOn ? (
                      <div style={{ marginTop: 20, background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 14, padding: "18px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                        <CheckCircle size={28} color="#4ade80" style={{ flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#4ade80", marginBottom: 3 }}>2FA is already enabled</div>
                          <div style={{ fontSize: 12, color: "rgba(148,163,184,0.6)" }}>Your account is secured. Click Continue below.</div>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* QR code + setup key */}
                        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginTop: 20, flexWrap: "wrap" }}>
                          {/* QR box */}
                          <div style={{ width: 128, height: 128, background: qrData ? "#fff" : "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                            {qrLoading ? (
                              <div style={{ fontSize: 11, color: "rgba(148,163,184,0.4)" }}>Loading…</div>
                            ) : qrData ? (
                              <img src={`data:image/png;base64,${qrData.qrCodeBase64}`} alt="Scan with authenticator" width={120} height={120} style={{ display: "block" }} />
                            ) : (
                              <div style={{ fontSize: 11, color: "rgba(248,113,113,0.6)", textAlign: "center", padding: 8 }}>Failed to load</div>
                            )}
                          </div>

                          {/* Setup key */}
                          <div style={{ flex: 1, minWidth: 160 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.08em", marginBottom: 6 }}>SETUP KEY</div>
                            {qrData ? (
                              <>
                                <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 14px", fontFamily: "monospace", fontSize: 11, color: "#a78bfa", letterSpacing: "0.1em", wordBreak: "break-all", marginBottom: 8 }}>
                                  {qrData.secret}
                                </div>
                                <p style={{ fontSize: 11, color: "rgba(100,116,139,0.5)", margin: 0 }}>Keep this key safe. Use it if you lose access to your authenticator app.</p>
                              </>
                            ) : qrError ? (
                              <>
                                <p style={{ fontSize: 12, color: "rgba(248,113,113,0.7)", margin: "0 0 10px" }}>Could not load QR code.</p>
                                <button
                                  onClick={loadQR}
                                  style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid rgba(167,139,250,0.3)", background: "rgba(167,139,250,0.08)", color: "#a78bfa", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                                >
                                  Retry
                                </button>
                              </>
                            ) : (
                              <div style={{ fontSize: 12, color: "rgba(148,163,184,0.3)" }}>Loading…</div>
                            )}
                          </div>
                        </div>

                        {/* OTP input — only show once QR is ready */}
                        {qrData && (
                          <div style={{ marginTop: 24 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.08em", marginBottom: 12 }}>ENTER THE 6-DIGIT CODE TO CONFIRM</div>
                            <div style={{ display: "flex", gap: 10 }}>
                              {otpCode.map((digit, i) => (
                                <input
                                  key={i}
                                  ref={el => (otpRefs.current[i] = el)}
                                  className="otp-box"
                                  type="text"
                                  inputMode="numeric"
                                  maxLength={1}
                                  value={digit}
                                  onChange={e => handleOTPChange(i, e.target.value)}
                                  onKeyDown={e => handleOTPKeyDown(i, e)}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {twoFaAlreadyOn ? (
                    <button
                      onClick={() => setStep(1)}
                      style={{ padding: "14px", borderRadius: 14, border: "none", background: "linear-gradient(135deg,#4ade80,#16a34a)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                    >
                      <CheckCircle size={16} /> Continue →
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleSecureAccount}
                        disabled={securing || !qrData || otpCode.join("").length < 6}
                        style={{ padding: "14px", borderRadius: 14, border: "none", background: "linear-gradient(135deg,#a78bfa,#7c3aed)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: (securing || !qrData || otpCode.join("").length < 6) ? 0.5 : 1 }}
                      >
                        {securing ? "Verifying…" : <><Shield size={16} /> Secure My Account</>}
                      </button>
                      <button
                        onClick={() => setStep(1)}
                        style={{ padding: "12px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "rgba(148,163,184,0.6)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        Skip for now — set up 2FA later from Settings
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ══ STEP 1 — BANK CONNECTION ══ */}
            {step === 1 && bankPhase === "connect" && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(34,211,238,0.7)", letterSpacing: "0.1em", marginBottom: 8 }}>STEP 2 OF 6</div>
                <h1 style={{ fontSize: 30, fontWeight: 800, color: "#fff", margin: "0 0 8px", letterSpacing: "-0.02em" }}>Connect your accounts</h1>
                <p style={{ fontSize: 14, color: "rgba(148,163,184,0.5)", margin: "0 0 28px", lineHeight: 1.7 }}>
                  Securely link your bank accounts via RBI's Account Aggregator framework. We never see your credentials — only the data you consent to share.
                </p>

                {/* Connect bank card */}
                <div style={{ background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 16, padding: "24px", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 11, background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Building2 size={18} color="#a78bfa" />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Auto-import Transactions</div>
                      <div style={{ fontSize: 12, color: "rgba(148,163,184,0.5)" }}>Powered by Setu Account Aggregator</div>
                    </div>
                    <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 100, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)", color: "#4ade80", whiteSpace: "nowrap" }}>RBI Regulated</span>
                  </div>

                  <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.08em", display: "block", marginBottom: 7 }}>MOBILE NUMBER (linked to your bank)</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      className="ob-input"
                      type="tel"
                      maxLength={10}
                      placeholder="10-digit mobile number"
                      value={mobile}
                      onChange={e => { setMobile(e.target.value.replace(/\D/g, "")); setMobileError(""); }}
                      style={{ flex: 1 }}
                    />
                    <button
                      onClick={handleBankConnect}
                      disabled={bankConnecting}
                      style={{ padding: "13px 20px", borderRadius: 13, border: "none", background: "linear-gradient(135deg,#a78bfa,#7c3aed)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: bankConnecting ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: bankConnecting ? 0.7 : 1, whiteSpace: "nowrap" }}
                    >
                      {bankConnecting ? "Connecting…" : "Connect →"}
                    </button>
                  </div>
                  {mobileError && <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>{mobileError}</div>}
                  <div style={{ display: "flex", gap: 16, marginTop: 14 }}>
                    {["🔒 Read-only", "🏦 No credentials shared", "⚡ Instant sync"].map(s => (
                      <span key={s} style={{ fontSize: 12, color: "rgba(100,116,139,0.6)" }}>{s}</span>
                    ))}
                  </div>
                </div>

                {/* Browse by type */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.08em", marginBottom: 12 }}>BROWSE BY TYPE</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {[
                      { icon: "🏦", label: "Bank Accounts",    desc: "Savings, current, salary" },
                      { icon: "📈", label: "Mutual Funds",      desc: "SIP, lumpsum, redemptions" },
                      { icon: "📊", label: "Stocks / Equities", desc: "Demat, trading accounts" },
                      { icon: "🛡️", label: "Insurance",        desc: "Life, health, general" },
                      { icon: "🏗️", label: "EPF",              desc: "Provident fund balance" },
                    ].map(t => (
                      <div key={t.label} style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "12px 14px", cursor: "pointer", transition: "all 0.15s" }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(167,139,250,0.3)"; e.currentTarget.style.background = "rgba(167,139,250,0.06)"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; e.currentTarget.style.background = "rgba(255,255,255,0.025)"; }}
                      >
                        <span style={{ fontSize: 18, display: "block", marginBottom: 4 }}>{t.icon}</span>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginBottom: 2 }}>{t.label}</div>
                        <div style={{ fontSize: 11, color: "rgba(148,163,184,0.5)" }}>{t.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Nav */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <button onClick={() => setStep(0)} style={{ fontSize: 13, fontWeight: 600, color: "rgba(148,163,184,0.5)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
                  <button onClick={handleManualPath} style={{ fontSize: 13, color: "rgba(148,163,184,0.5)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                    Skip — I'll add manually →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 1 — syncing phase */}
            {step === 1 && bankPhase === "syncing" && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(34,211,238,0.7)", letterSpacing: "0.1em", marginBottom: 8 }}>STEP 2 OF 6</div>
                <h1 style={{ fontSize: 30, fontWeight: 800, color: "#fff", margin: "0 0 8px", letterSpacing: "-0.02em" }}>Syncing your account</h1>
                <p style={{ fontSize: 14, color: "rgba(148,163,184,0.5)", margin: "0 0 28px", lineHeight: 1.7 }}>
                  Complete the bank consent in the tab that just opened, then return here.
                </p>

                {/* Status card */}
                <div style={{ background: syncStatus === "synced" ? "rgba(74,222,128,0.07)" : "rgba(167,139,250,0.05)", border: `1px solid ${syncStatus === "synced" ? "rgba(74,222,128,0.2)" : "rgba(167,139,250,0.15)"}`, borderRadius: 16, padding: "28px 24px", marginBottom: 24, textAlign: "center" }}>
                  {syncStatus === "synced" ? (
                    <>
                      <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                        <CheckCircle size={26} color="#4ade80" />
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#4ade80", marginBottom: 6 }}>Transactions Imported!</div>
                      <div style={{ fontSize: 13, color: "rgba(148,163,184,0.5)" }}>Your bank account is connected and transactions are ready.</div>
                    </>
                  ) : (
                    <>
                      <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                        <RefreshCw size={22} color="#a78bfa" className="spin" />
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "#e2e8f0", marginBottom: 8 }}>
                        {syncStatus === "consented" ? "Fetching transactions from your bank…" : "Waiting for consent…"}
                      </div>
                      <div style={{ fontSize: 13, color: "rgba(148,163,184,0.5)", marginBottom: 16 }}>{syncMsg}</div>
                      <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
                        {[0, 1, 2].map(i => <div key={i} className="sync-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: "#a78bfa" }} />)}
                      </div>
                    </>
                  )}
                </div>

                {/* Progress steps */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
                  {[
                    { label: "Bank consent initiated",   done: true },
                    { label: "Consent approved by user", done: syncStatus === "consented" || syncStatus === "synced" },
                    { label: "Transactions fetched",     done: syncStatus === "synced" },
                  ].map(({ label, done }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: done ? "rgba(74,222,128,0.05)" : "rgba(255,255,255,0.02)", border: `1px solid ${done ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.06)"}` }}>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", background: done ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${done ? "rgba(74,222,128,0.4)" : "rgba(255,255,255,0.1)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {done && <CheckCircle size={11} color="#4ade80" />}
                      </div>
                      <span style={{ fontSize: 13, color: done ? "#e2e8f0" : "rgba(148,163,184,0.4)" }}>{label}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setBankPhase("connect")} style={{ padding: "14px 20px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "rgba(148,163,184,0.6)", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
                  <button
                    onClick={() => setStep(2)}
                    disabled={!canContinueSync}
                    style={{ flex: 1, padding: "14px", borderRadius: 14, border: "none", background: canContinueSync ? "linear-gradient(135deg,#a78bfa,#7c3aed)" : "rgba(255,255,255,0.04)", color: canContinueSync ? "#fff" : "rgba(148,163,184,0.3)", fontSize: 14, fontWeight: 800, cursor: canContinueSync ? "pointer" : "not-allowed", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.3s" }}
                  >
                    {syncStatus === "synced" ? "Continue to Profile" : skipVisible ? "Skip Sync & Continue" : "Waiting for sync…"} <ChevronRight size={16} />
                  </button>
                </div>
                {skipVisible && syncStatus !== "synced" && (
                  <p style={{ textAlign: "center", fontSize: 12, color: "rgba(100,116,139,0.5)", margin: "12px 0 0" }}>Transactions will auto-sync once you complete bank consent. You can continue now and they'll appear on your dashboard.</p>
                )}
              </div>
            )}

            {/* ══ STEP 2 — FINANCIAL PROFILE ══ */}
            {step === 2 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(74,222,128,0.7)", letterSpacing: "0.1em", marginBottom: 8 }}>STEP 3 OF 6</div>
                <h1 style={{ fontSize: 30, fontWeight: 800, color: "#fff", margin: "0 0 8px", letterSpacing: "-0.02em" }}>Your financial profile</h1>
                <p style={{ fontSize: 14, color: "rgba(148,163,184,0.5)", margin: "0 0 28px", lineHeight: 1.7 }}>
                  A few numbers to set up your net worth, forecasts, and AI insights. All optional — update anytime from your dashboard.
                </p>

                {/* Income + expenses */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.08em", marginBottom: 12 }}>MONTHLY CASH FLOW</div>

                  {isManualPath ? (
                    /* Manual path: editable required inputs */
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>💰 INCOME</label>
                        <input
                          className="ob-input"
                          type="number"
                          placeholder="₹ 50,000"
                          value={monthlyIncome}
                          onChange={e => { setMonthlyIncome(e.target.value); setManualErrors(p => ({ ...p, income: undefined })); }}
                          style={manualErrors.income ? { borderColor: "rgba(248,113,113,0.5)" } : {}}
                        />
                        {manualErrors.income
                          ? <div style={{ fontSize: 11, color: "#f87171", marginTop: 5 }}>{manualErrors.income}</div>
                          : <div style={{ fontSize: 11, color: "rgba(100,116,139,0.4)", marginTop: 5 }}>Salary, freelance, business…</div>
                        }
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>💸 EXPENSES</label>
                        <input
                          className="ob-input"
                          type="number"
                          placeholder="₹ 35,000"
                          value={monthlyExpenses}
                          onChange={e => { setMonthlyExpenses(e.target.value); setManualErrors(p => ({ ...p, expenses: undefined })); }}
                          style={manualErrors.expenses ? { borderColor: "rgba(248,113,113,0.5)" } : {}}
                        />
                        {manualErrors.expenses
                          ? <div style={{ fontSize: 11, color: "#f87171", marginTop: 5 }}>{manualErrors.expenses}</div>
                          : <div style={{ fontSize: 11, color: "rgba(100,116,139,0.4)", marginTop: 5 }}>Rent, food, bills, subscriptions…</div>
                        }
                      </div>
                    </div>
                  ) : (
                    /* Bank path: read-only auto-detected values — user cannot manually enter */
                    <div style={{ background: "rgba(74,222,128,0.04)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 14, padding: "18px 20px" }}>
                      {summaryData ? (
                        <div style={{ display: "flex", gap: 32 }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.45)", letterSpacing: "0.08em", marginBottom: 4 }}>💰 INCOME</div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: "#4ade80" }}>₹{Number(monthlyIncome || 0).toLocaleString("en-IN")}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.45)", letterSpacing: "0.08em", marginBottom: 4 }}>💸 EXPENSES</div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: "#f87171" }}>₹{Number(monthlyExpenses || 0).toLocaleString("en-IN")}</div>
                          </div>
                          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#4ade80", background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 6, padding: "3px 8px" }}>AUTO-DETECTED FROM BANK</span>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <RefreshCw size={14} color="#a78bfa" className="spin" />
                          <span style={{ fontSize: 13, color: "rgba(148,163,184,0.5)" }}>Cash flow will be auto-calculated from your imported transactions</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Savings/investments/debt */}
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.08em", marginBottom: 12 }}>NET WORTH SNAPSHOT</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    {[
                      ...(isManualPath ? [{ key: "savings", label: "Total Assets", sublabel: "Cash, savings, FDs, gold…", placeholder: "₹ 2,00,000", icon: "🏦" }] : []),
                      { key: "investments", label: "Investments", sublabel: "Stocks, MF, PF…", placeholder: "₹ 1,50,000", icon: "📊" },
                      { key: "debt", label: "Existing Debt", sublabel: "Loans, credit cards…", placeholder: "₹ 50,000", icon: "💳", full: !isManualPath },
                    ].map(f => (
                      <div key={f.key} style={f.full ? { gridColumn: "1 / -1" } : {}}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                          <span>{f.icon}</span> {f.label.toUpperCase()}
                          <span style={{ fontSize: 11, color: "rgba(100,116,139,0.45)", fontWeight: 400 }}>({f.sublabel})</span>
                        </label>
                        <input
                          className="ob-input"
                          type="number"
                          placeholder={f.placeholder}
                          value={form[f.key]}
                          onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setStep(1)} style={{ padding: "14px 20px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "rgba(148,163,184,0.6)", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
                  <button onClick={handleProfileContinue} style={{ flex: 1, padding: "14px", borderRadius: 14, border: "none", background: "linear-gradient(135deg,#a78bfa,#7c3aed)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    Continue <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* ══ STEP 3 — GOALS ══ */}
            {step === 3 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(251,191,36,0.7)", letterSpacing: "0.1em", marginBottom: 8 }}>STEP 4 OF 6</div>
                <h1 style={{ fontSize: 30, fontWeight: 800, color: "#fff", margin: "0 0 8px", letterSpacing: "-0.02em" }}>What are your goals?</h1>
                <p style={{ fontSize: 14, color: "rgba(148,163,184,0.5)", margin: "0 0 8px", lineHeight: 1.7 }}>
                  Select the financial goals you want FinTwin to help you achieve.
                </p>
                <p style={{ fontSize: 13, color: "rgba(167,139,250,0.7)", margin: "0 0 28px" }}>
                  FinTwin AI will build a personalised savings plan for each goal you select.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 36 }}>
                  {GOALS.map(g => (
                    <button key={g} className={`goal-chip ${goals.includes(g) ? "active" : ""}`} onClick={() => toggleGoal(g)}>
                      {GOAL_ICONS[g]} {g}
                      {goals.includes(g) && <CheckCircle size={12} style={{ display: "inline", marginLeft: 6, verticalAlign: "middle" }} />}
                    </button>
                  ))}
                </div>
                {goals.length > 0 && (
                  <div style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 12, padding: "12px 16px", marginBottom: 24, fontSize: 12, color: "rgba(167,139,250,0.8)" }}>
                    ✨ {goals.length} goal{goals.length > 1 ? "s" : ""} selected — AI will prioritise these in your dashboard
                  </div>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setStep(2)} style={{ padding: "14px 20px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "rgba(148,163,184,0.6)", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
                  <button onClick={() => setStep(4)} style={{ flex: 1, padding: "14px", borderRadius: 14, border: "none", background: "linear-gradient(135deg,#a78bfa,#7c3aed)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    Continue <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* ══ STEP 4 — AI SETUP ══ */}
            {step === 4 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(34,211,238,0.7)", letterSpacing: "0.1em", marginBottom: 8 }}>STEP 5 OF 6</div>
                <h1 style={{ fontSize: 30, fontWeight: 800, color: "#fff", margin: "0 0 8px", letterSpacing: "-0.02em" }}>Choose your AI Copilot</h1>
                <p style={{ fontSize: 14, color: "rgba(148,163,184,0.5)", margin: "0 0 28px", lineHeight: 1.7 }}>
                  Pick a default advisor personality. Your AI will tailor every insight, suggestion, and response based on this mode. You can switch anytime.
                </p>

                <div style={{ fontSize: 12, color: "rgba(148,163,184,0.45)", marginBottom: 12, marginTop: -16 }}>Select one or more — your AI will blend all chosen styles.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
                  {AI_MODES.map(m => {
                    const on = aiModes.includes(m.id);
                    return (
                      <div
                        key={m.id}
                        className={`ai-mode-card ${on ? "selected" : ""}`}
                        onClick={() => setAiModes(prev =>
                          prev.includes(m.id)
                            ? prev.filter(x => x !== m.id)
                            : [...prev, m.id]
                        )}
                      >
                        <span style={{ fontSize: 24, flexShrink: 0 }}>{m.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: on ? "#a78bfa" : "#e2e8f0", marginBottom: 2 }}>{m.id}</div>
                          <div style={{ fontSize: 12, color: "rgba(148,163,184,0.6)" }}>{m.desc}</div>
                        </div>
                        {on && <CheckCircle size={16} color="#a78bfa" style={{ flexShrink: 0 }} />}
                      </div>
                    );
                  })}
                </div>

                {/* Toggles */}
                <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, overflow: "hidden", marginBottom: 28 }}>
                  {[
                    { label: "Daily AI insights",      desc: "Receive a daily financial summary",        icon: <Bell size={15} color="#fbbf24" />,    val: dailyInsights, set: setDailyInsights },
                  ].map((t, i, arr) => (
                    <div key={t.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px", borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {t.icon}
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{t.label}</div>
                          <div style={{ fontSize: 12, color: "rgba(148,163,184,0.5)" }}>{t.desc}</div>
                        </div>
                      </div>
                      <button
                        className="ob-toggle"
                        onClick={() => t.set(!t.val)}
                        style={{ background: t.val ? "linear-gradient(135deg,#a78bfa,#7c3aed)" : "rgba(255,255,255,0.1)" }}
                      >
                        <div className="ob-toggle-thumb" style={{ transform: t.val ? "translateX(23px)" : "translateX(3px)" }} />
                      </button>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setStep(3)} style={{ padding: "14px 20px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "rgba(148,163,184,0.6)", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
                  <button
                    onClick={() => setStep(5)}
                    disabled={aiModes.length === 0}
                    style={{ flex: 1, padding: "14px", borderRadius: 14, border: "none", background: aiModes.length === 0 ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg,#a78bfa,#7c3aed)", color: aiModes.length === 0 ? "rgba(148,163,184,0.4)" : "#fff", fontSize: 14, fontWeight: 800, cursor: aiModes.length === 0 ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                  >
                    Continue <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* ══ STEP 5 — REVIEW ══ */}
            {step === 5 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(74,222,128,0.7)", letterSpacing: "0.1em", marginBottom: 8 }}>STEP 6 OF 6</div>
                <h1 style={{ fontSize: 30, fontWeight: 800, color: "#fff", margin: "0 0 8px", letterSpacing: "-0.02em" }}>Review your financial twin</h1>
                <p style={{ fontSize: 14, color: "rgba(148,163,184,0.5)", margin: "0 0 28px", lineHeight: 1.7 }}>
                  Let's confirm everything is accurate before we build your AI profile.
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 28 }}>

                  {/* Financial Profile */}
                  <div className="review-card">
                    <button className="review-card-edit" onClick={() => setStep(2)}><Edit2 size={11} /> Edit</button>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em", marginBottom: 8 }}>FINANCIAL PROFILE</div>
                    {isManualPath ? (
                      <>
                        <div style={{ fontSize: 12, color: "rgba(148,163,184,0.6)", marginBottom: 4 }}>Monthly income</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#4ade80", marginBottom: 8 }}>₹{Number(monthlyIncome || 0).toLocaleString("en-IN")}</div>
                        <div style={{ fontSize: 12, color: "rgba(148,163,184,0.6)", marginBottom: 4 }}>Monthly expenses</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#f87171", marginBottom: 8 }}>₹{Number(monthlyExpenses || 0).toLocaleString("en-IN")}</div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: "rgba(148,163,184,0.5)" }}>Connected via bank auto-sync</div>
                    )}
                    <div style={{ fontSize: 12, color: "rgba(148,163,184,0.6)", marginBottom: 4 }}>Investments</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#a78bfa" }}>₹{Number(form.investments || 0).toLocaleString("en-IN")}</div>
                  </div>

                  {/* Goals */}
                  <div className="review-card">
                    <button className="review-card-edit" onClick={() => setStep(3)}><Edit2 size={11} /> Edit</button>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em", marginBottom: 8 }}>GOALS</div>
                    {goals.length > 0 ? (
                      <>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#fbbf24", marginBottom: 8 }}>{goals.length} goal{goals.length > 1 ? "s" : ""} selected</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {goals.map(g => (
                            <span key={g} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 100, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", color: "#fbbf24" }}>
                              {GOAL_ICONS[g]} {g}
                            </span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: "rgba(148,163,184,0.4)" }}>No goals selected — you can add them from the Goals Planner</div>
                    )}
                  </div>

                  {/* Bank Connections */}
                  <div className="review-card">
                    <button className="review-card-edit" onClick={() => { setBankPhase("connect"); setStep(1); }}><Edit2 size={11} /> Edit</button>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em", marginBottom: 8 }}>BANK CONNECTION</div>
                    {!isManualPath ? (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: syncStatus === "synced" ? "#4ade80" : "#fbbf24" }} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: syncStatus === "synced" ? "#4ade80" : "#fbbf24" }}>
                            {syncStatus === "synced" ? "Bank connected" : "Consent pending"}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "rgba(148,163,184,0.5)" }}>Via Setu Account Aggregator</div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: "rgba(148,163,184,0.5)" }}>Manual entry — add transactions from the Transactions page</div>
                    )}
                  </div>

                  {/* AI Setup */}
                  <div className="review-card">
                    <button className="review-card-edit" onClick={() => setStep(4)}><Edit2 size={11} /> Edit</button>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em", marginBottom: 8 }}>AI COPILOT</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                      {aiModes.map(id => <span key={id} style={{ fontSize: 13, fontWeight: 700, color: "#22d3ee" }}>{id}</span>).reduce((acc, el, i) => i === 0 ? [el] : [...acc, <span key={`sep-${i}`} style={{ color: "rgba(148,163,184,0.3)", fontSize: 13 }}>·</span>, el], [])}
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(148,163,184,0.5)" }}>
                      {dailyInsights ? "🔔 Daily insights on" : "🔕 Daily insights off"}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setStep(4)} style={{ padding: "14px 20px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "rgba(148,163,184,0.6)", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
                  <button
                    onClick={handleSubmit}
                    style={{ flex: 1, padding: "14px", borderRadius: 14, border: "none", background: "linear-gradient(135deg,#4ade80,#22d3ee)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                  >
                    Create My Financial Twin <Sparkles size={16} />
                  </button>
                </div>
              </div>
            )}

          </div>

          {/* Right: ambient panel */}
          <div className="ob-right-panel" style={{ position: "sticky", top: 80, height: "fit-content" }}>
            {step === 0 && <SecurityPanel />}
            {step === 1 && <BankPanel data={netWorthData} />}
            {step === 2 && <ProfilePanel income={monthlyIncome} expenses={monthlyExpenses} />}
            {step === 3 && (
              <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 20, padding: "24px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em", marginBottom: 14 }}>YOUR GOALS</div>
                {goals.length === 0
                  ? <p style={{ fontSize: 13, color: "rgba(148,163,184,0.4)", textAlign: "center", padding: "24px 0" }}>Select goals on the left to see them here</p>
                  : goals.map(g => (
                    <div key={g} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 13, color: "#e2e8f0" }}>
                      <span style={{ fontSize: 18 }}>{GOAL_ICONS[g]}</span> {g}
                    </div>
                  ))
                }
              </div>
            )}
            {step === 4 && <AIPanel aiModes={aiModes} />}
            {step === 5 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center", padding: "24px" }}>
                <div style={{ fontSize: 48 }}>🎉</div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: 0 }}>Almost there!</h3>
                <p style={{ fontSize: 13, color: "rgba(148,163,184,0.5)", lineHeight: 1.6 }}>Once you create your twin, FinTwin AI will start building personalised insights, forecasts, and a savings strategy just for you.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                  {["AI Financial Score", "6-month Spending Forecast", "Personalised Budget Alerts", "Goal Progress Tracking"].map(f => (
                    <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(148,163,184,0.7)" }}>
                      <CheckCircle size={13} color="#4ade80" /> {f}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
