import { useState, useEffect, useRef } from "react";
import {
  Settings, Cpu, Shield, CreditCard, Info, Wifi,
  Copy, Download, Trash2, RotateCcw, Database,
  Bell, CheckCircle, ChevronRight, Building2,
  Unlink, Lock, X, ShieldCheck, ShieldOff
} from "lucide-react";
import API, { identityApi } from "../services/api";
import toast from "react-hot-toast";
import { useTheme } from "../context/ThemeContext";
import { useCurrency, CURRENCIES } from "../context/CurrencyContext";
import ChangePasswordModal from "./ChangePasswordModal";
import DeleteAccountModal from "./DeleteAccountModal";

const AI_MODES = [
  { id: "Savings Advisor",    icon: "🐷", desc: "Optimise your savings rate and build an emergency fund" },
  { id: "Investment Advisor", icon: "📈", desc: "Grow wealth through smart investment recommendations" },
  { id: "Budget Coach",       icon: "📊", desc: "Stay on track with personalised budget management" },
  { id: "Fraud Analyst",      icon: "🔍", desc: "Detect suspicious patterns and protect your finances" },
  { id: "Purchase Advisor",   icon: "🛒", desc: "Analyse affordability before any major purchase" },
];

const TABS = [
  { id: "general",      label: "General",        Icon: Settings   },
  { id: "connections",  label: "Connections",     Icon: Wifi       },
  { id: "account",      label: "Account",         Icon: Shield     },
  { id: "ai",           label: "AI Preferences",  Icon: Cpu        },
  { id: "subscription", label: "Subscription",    Icon: CreditCard },
  { id: "about",        label: "About",            Icon: Info       },
];

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
  .sp-root * { box-sizing:border-box; }
  .sp-otp-box { width:46px; height:54px; border-radius:12px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.09); color:#e2e8f0; font-size:20px; font-weight:700; text-align:center; outline:none; font-family:inherit; transition:all 0.2s; }
  .sp-otp-box:focus { border-color:rgba(167,139,250,0.5); box-shadow:0 0 0 3px rgba(167,139,250,0.07); }
  @keyframes spOverlayIn { from{opacity:0} to{opacity:1} }
  @keyframes spModalIn { from{opacity:0;transform:translateY(20px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
  .sp-overlay { animation:spOverlayIn 0.2s ease both; }
  .sp-modal  { animation:spModalIn  0.25s ease both; }
  .sp-root { font-family:'DM Sans',system-ui,sans-serif; }
  .sp-tab-btn { display:flex; align-items:center; gap:10px; width:100%; padding:10px 14px; border-radius:12px; border:none; cursor:pointer; font-size:13px; font-weight:600; font-family:inherit; text-align:left; transition:all 0.15s; }
  .sp-tab-btn:hover { background:rgba(255,255,255,0.05); }
  .sp-tab-btn.active { background:rgba(167,139,250,0.12); color:#a78bfa; }
  .sp-row { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; gap:10px; }
  .sp-row + .sp-row { border-top:1px solid rgba(255,255,255,0.06); }
  .sp-action-btn { padding:8px 16px; border-radius:10px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.04); color:rgba(148,163,184,0.8); font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; transition:all 0.15s; white-space:nowrap; flex-shrink:0; }
  .sp-action-btn:hover { background:rgba(255,255,255,0.08); color:#e2e8f0; }
  .sp-action-btn.danger { background:rgba(248,113,113,0.08); border-color:rgba(248,113,113,0.2); color:#f87171; }
  .sp-action-btn.danger:hover { background:#f87171; color:#fff; border-color:#f87171; }
  .sp-action-btn.primary { background:rgba(167,139,250,0.12); border-color:rgba(167,139,250,0.3); color:#a78bfa; }
  .sp-action-btn.primary:hover { background:rgba(167,139,250,0.2); }
  .sp-toggle { width:46px; height:26px; border-radius:99px; border:none; cursor:pointer; position:relative; transition:background 0.3s; flex-shrink:0; }
  .sp-toggle-thumb { position:absolute; top:3px; width:20px; height:20px; border-radius:50%; background:#fff; transition:transform 0.3s; box-shadow:0 2px 6px rgba(0,0,0,0.3); }
  .sp-card { background:rgba(255,255,255,0.025); border:1px solid rgba(255,255,255,0.07); border-radius:16px; overflow:hidden; margin-bottom:16px; }
  .sp-card-label { padding:12px 20px 10px; border-bottom:1px solid rgba(255,255,255,0.06); font-size:10px; font-weight:700; letter-spacing:0.1em; color:rgba(148,163,184,0.5); }
  .sp-ai-card { padding:14px 16px; border-radius:14px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.02); cursor:pointer; transition:all 0.15s; }
  .sp-ai-card.selected { background:rgba(167,139,250,0.1); border-color:rgba(167,139,250,0.35); }
  .sp-ai-card:hover:not(.selected) { background:rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.12); }
  .sp-conn-card { padding:16px 20px; border-radius:14px; background:rgba(255,255,255,0.025); border:1px solid rgba(255,255,255,0.07); display:flex; align-items:center; gap:14px; }
  @media (max-width: 640px) {
    .sp-layout { flex-direction: column !important; }
    .sp-sidebar {
      width: 100% !important; flex-direction: row !important; overflow-x: auto;
      gap: 4px !important; padding: 6px !important;
      scrollbar-width: none; -webkit-overflow-scrolling: touch;
    }
    .sp-sidebar::-webkit-scrollbar { display: none; }
    .sp-tab-btn { white-space: nowrap; width: auto !important; flex-shrink: 0; padding: 8px 12px !important; }
    .sp-row { flex-wrap: wrap; }
    .sp-row > div:first-child { flex: 1; min-width: 0; }
    .sp-conn-card { flex-wrap: wrap; }
    .sp-conn-card > button { width: 100%; justify-content: center; }
  }
`;

function SectionLabel({ children }) {
  return <div className="sp-card-label">{children}</div>;
}

function Toggle({ on, onChange }) {
  return (
    <button
      className="sp-toggle"
      onClick={() => onChange(!on)}
      style={{ background: on ? "linear-gradient(135deg,#a78bfa,#7c3aed)" : "rgba(255,255,255,0.1)" }}
    >
      <div className="sp-toggle-thumb" style={{ transform: on ? "translateX(23px)" : "translateX(3px)" }} />
    </button>
  );
}

// ── Inline 2FA modal ──────────────────────────────────────────────────────────

function TwoFAModal({ enabled, onClose, onSuccess }) {
  const [phase,      setPhase]      = useState(enabled ? "disable" : "setup");
  const [qrData,     setQrData]     = useState(null);  // { qrCodeBase64, secret }
  const [qrLoading,  setQrLoading]  = useState(false);
  const [otpCode,    setOtpCode]    = useState(["", "", "", "", "", ""]);
  const [submitting, setSubmitting] = useState(false);
  const otpRefs = useRef([]);

  useEffect(() => {
    if (phase === "setup") loadSetup();
  }, []);

  const loadSetup = async () => {
    setQrLoading(true);
    try {
      const r = await identityApi.post("/2fa/setup");
      setQrData(r.data);
    } catch { toast.error("Failed to generate QR. Try again."); }
    finally  { setQrLoading(false); }
  };

  const handleOTPChange = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otpCode]; next[i] = val; setOtpCode(next);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const handleOTPKeyDown = (i, e) => {
    if (e.key === "Backspace" && !otpCode[i] && i > 0) otpRefs.current[i - 1]?.focus();
  };

  const handleOTPPaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = pasted.split("").concat(Array(6).fill("")).slice(0, 6);
    setOtpCode(next);
    otpRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleEnable = async () => {
    const code = otpCode.join("");
    if (code.length < 6) { toast.error("Enter the 6-digit code"); return; }
    setSubmitting(true);
    try {
      await identityApi.post("/2fa/enable", { code });
      toast.success("2FA enabled! You'll need a code on every login.");
      onSuccess(true);
    } catch (err) {
      toast.error(err.response?.data?.error || "Invalid code. Try again.");
    } finally { setSubmitting(false); }
  };

  const handleDisable = async () => {
    const code = otpCode.join("");
    if (code.length < 6) { toast.error("Enter the 6-digit code"); return; }
    setSubmitting(true);
    try {
      await identityApi.post("/2fa/disable", { code });
      toast.success("2FA disabled.");
      onSuccess(false);
    } catch (err) {
      toast.error(err.response?.data?.error || "Invalid code. Try again.");
    } finally { setSubmitting(false); }
  };

  const OTPInputs = () => (
    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
      {otpCode.map((d, i) => (
        <input
          key={i}
          ref={el => (otpRefs.current[i] = el)}
          className="sp-otp-box"
          type="text" inputMode="numeric" maxLength={1}
          value={d}
          onChange={e => handleOTPChange(i, e.target.value)}
          onKeyDown={e => handleOTPKeyDown(i, e)}
          onPaste={i === 0 ? handleOTPPaste : undefined}
          autoFocus={i === 0}
        />
      ))}
    </div>
  );

  return (
    <div
      className="sp-overlay"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="sp-modal"
        style={{ width: "100%", maxWidth: 440, background: "rgba(10,12,18,0.98)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 24, overflow: "hidden", boxShadow: "0 40px 100px rgba(0,0,0,0.8)" }}
      >
        {/* Header */}
        <div style={{ height: 2, background: "linear-gradient(90deg,#a78bfa,#22d3ee)" }} />
        <div style={{ padding: "24px 28px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: phase === "disable" ? "rgba(248,113,113,0.1)" : "rgba(167,139,250,0.1)", border: `1px solid ${phase === "disable" ? "rgba(248,113,113,0.25)" : "rgba(167,139,250,0.25)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {phase === "disable" ? <ShieldOff size={20} color="#f87171" /> : <ShieldCheck size={20} color="#a78bfa" />}
            </div>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: "#fff", margin: 0 }}>
                {phase === "disable" ? "Disable 2FA" : "Set up 2FA"}
              </h3>
              <p style={{ fontSize: 12, color: "rgba(148,163,184,0.5)", margin: 0 }}>
                {phase === "disable" ? "Enter your current authenticator code" : "Scan QR with your authenticator app"}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(148,163,184,0.5)", padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: "20px 28px 28px" }}>
          {/* Setup phase */}
          {phase === "setup" && (
            <>
              {qrLoading ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(148,163,184,0.4)", fontSize: 13 }}>
                  Generating QR code…
                </div>
              ) : qrData ? (
                <>
                  <div style={{ display: "flex", gap: 18, alignItems: "flex-start", marginBottom: 20 }}>
                    <div style={{ background: "#fff", padding: 8, borderRadius: 12, flexShrink: 0 }}>
                      <img src={`data:image/png;base64,${qrData.qrCodeBase64}`} alt="2FA QR code" width={120} height={120} style={{ display: "block" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.08em", marginBottom: 6 }}>SETUP KEY</div>
                      <div
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 12px", fontFamily: "monospace", fontSize: 11, color: "#a78bfa", letterSpacing: "0.12em", wordBreak: "break-all", marginBottom: 8 }}
                      >
                        {qrData.secret}
                      </div>
                      <p style={{ fontSize: 11, color: "rgba(100,116,139,0.5)", margin: 0, lineHeight: 1.5 }}>
                        Use if you can't scan the QR code. Keep this key safe.
                      </p>
                    </div>
                  </div>

                  <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.08em", marginBottom: 10 }}>
                    ENTER THE 6-DIGIT CODE TO CONFIRM
                  </div>
                  <OTPInputs />
                  <button
                    onClick={handleEnable}
                    disabled={submitting || otpCode.join("").length < 6}
                    style={{ marginTop: 18, width: "100%", padding: "13px", borderRadius: 13, border: "none", background: "linear-gradient(135deg,#a78bfa,#7c3aed)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: (submitting || otpCode.join("").length < 6) ? 0.6 : 1 }}
                  >
                    {submitting ? "Enabling…" : "Enable Two-Factor Auth"}
                  </button>
                </>
              ) : (
                <button onClick={loadSetup} style={{ width: "100%", padding: 13, borderRadius: 13, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#e2e8f0", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Retry
                </button>
              )}
            </>
          )}

          {/* Disable phase */}
          {phase === "disable" && (
            <>
              <p style={{ fontSize: 13, color: "rgba(148,163,184,0.5)", marginBottom: 20, lineHeight: 1.6 }}>
                Open your authenticator app and enter the current 6-digit code to confirm.
              </p>
              <OTPInputs />
              <button
                onClick={handleDisable}
                disabled={submitting || otpCode.join("").length < 6}
                style={{ marginTop: 18, width: "100%", padding: "13px", borderRadius: 13, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.15)", color: "#f87171", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: (submitting || otpCode.join("").length < 6) ? 0.6 : 1 }}
              >
                {submitting ? "Disabling…" : "Disable Two-Factor Auth"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Settings ─────────────────────────────────────────────────────────────

export default function SettingsPage({ navigateTo }) {
  const { isDark, toggleTheme }     = useTheme();
  const { currency, setCurrency }   = useCurrency();

  const [activeTab, setActiveTab]           = useState("general");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal]     = useState(false);
  const [showTwoFAModal, setShowTwoFAModal]       = useState(false);
  const [twoFaEnabled,  setTwoFaEnabled]          = useState(null);
  const [profile, setProfile]               = useState(null);
  const [connections, setConnections]       = useState([]);
  const [connLoading, setConnLoading]       = useState(false);

  const [aiMode, setAiMode]               = useState(() => localStorage.getItem("aiMode") || "Savings Advisor");
  const [dailyInsights, setDailyInsights] = useState(() => localStorage.getItem("dailyInsights") !== "false");

  useEffect(() => { fetchProfile(); }, []);
  useEffect(() => { if (activeTab === "connections") fetchConnections(); }, [activeTab]);
  useEffect(() => { if (activeTab === "account") fetchTwoFAStatus(); }, [activeTab]);

  const fetchProfile = async () => {
    try { const r = await API.get("/profile"); setProfile(r.data); } catch {}
  };

  const fetchTwoFAStatus = async () => {
    try { const r = await identityApi.get("/2fa/status"); setTwoFaEnabled(r.data.enabled); } catch {}
  };

  const fetchConnections = async () => {
    setConnLoading(true);
    try { const r = await API.get("/bank/connections"); setConnections(r.data || []); }
    catch {} finally { setConnLoading(false); }
  };

  const handleExportCSV = async () => {
    try {
      const r = await API.get("/transactions/export", { responseType: "blob" });
      const url = window.URL.createObjectURL(r.data);
      const a   = document.createElement("a");
      a.href     = url; a.download = "FinTwin_Transactions.csv"; a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Transactions exported!");
    } catch { toast.error("Export failed. Try again."); }
  };

  const handleClearCache = () => {
    const keep = ["token", "activeSection"];
    Object.keys(localStorage).forEach(k => { if (!keep.includes(k)) localStorage.removeItem(k); });
    toast.success("Local cache cleared.");
  };

  const handleSaveAI = () => {
    localStorage.setItem("aiMode", aiMode);
    localStorage.setItem("dailyInsights", String(dailyInsights));
    // TODO: POST /profile/ai-preferences when backend endpoint is ready
    toast.success("AI preferences saved!");
  };

  const handleDisconnect = async (id) => {
    try {
      await API.delete(`/bank/${id}`);
      setConnections(prev => prev.filter(c => c.id !== id));
      toast.success("Bank account disconnected.");
    } catch { toast.error("Failed to disconnect."); }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  const statusColor = (status) => {
    if (status === "ACTIVE") return "#4ade80";
    if (status === "PENDING" || status === "FETCHING") return "#fbbf24";
    return "#f87171";
  };

  const statusLabel = (status) => {
    if (status === "ACTIVE") return "Connected";
    if (status === "FETCHING") return "Syncing…";
    if (status === "PENDING") return "Pending";
    return status;
  };

  return (
    <>
      <style>{CSS}</style>
      <ChangePasswordModal open={showPasswordModal} onClose={() => setShowPasswordModal(false)} />
      <DeleteAccountModal  open={showDeleteModal}   onClose={() => setShowDeleteModal(false)} />
      {showTwoFAModal && (
        <TwoFAModal
          enabled={twoFaEnabled}
          onClose={() => setShowTwoFAModal(false)}
          onSuccess={(newState) => { setTwoFaEnabled(newState); setShowTwoFAModal(false); }}
        />
      )}

      <div className="sp-root" style={{ maxWidth: 900, fontFamily: "'DM Sans',system-ui,sans-serif" }}>

        {/* Page header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-label)", letterSpacing: "0.12em", marginBottom: 6 }}>PREFERENCES</div>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em", margin: 0 }}>Settings</h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 0" }}>Manage your account and preferences</p>
        </div>

        {/* Two-column layout */}
        <div className="sp-layout" style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>

          {/* Left sidebar nav */}
          <div className="sp-sidebar" style={{
            width: 200, flexShrink: 0,
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 16, padding: 8,
          }}>
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={`sp-tab-btn ${activeTab === id ? "active" : ""}`}
                onClick={() => setActiveTab(id)}
                style={{ color: activeTab === id ? "#a78bfa" : "var(--text-muted)" }}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          {/* Right content */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* ── GENERAL ── */}
            {activeTab === "general" && (
              <>
                {/* Appearance */}
                <div className="sp-card">
                  <SectionLabel>APPEARANCE</SectionLabel>
                  <div className="sp-row">
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: isDark ? "rgba(167,139,250,0.1)" : "rgba(251,191,36,0.1)", border: `1px solid ${isDark ? "rgba(167,139,250,0.25)" : "rgba(251,191,36,0.3)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                        {isDark ? "🌙" : "☀️"}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{isDark ? "Dark Mode" : "Light Mode"}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{isDark ? "Easy on the eyes in low light" : "Clean look for bright environments"}</div>
                      </div>
                    </div>
                    <Toggle on={isDark} onChange={toggleTheme} />
                  </div>
                </div>

                {/* Currency */}
                <div className="sp-card">
                  <SectionLabel>CURRENCY</SectionLabel>
                  <div style={{ padding: "16px 20px" }}>
                    <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 12px" }}>Choose the currency symbol displayed throughout the app.</p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {CURRENCIES.map(c => (
                        <button
                          key={c.code}
                          onClick={() => setCurrency(c)}
                          style={{
                            padding: "8px 16px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                            background: currency.code === c.code ? "rgba(167,139,250,0.12)" : "rgba(255,255,255,0.04)",
                            border: `1px solid ${currency.code === c.code ? "rgba(167,139,250,0.4)" : "rgba(255,255,255,0.09)"}`,
                            color: currency.code === c.code ? "#a78bfa" : "var(--text-muted)",
                            fontSize: 13, fontWeight: 600, transition: "all 0.15s",
                          }}
                        >
                          {c.symbol} {c.code}
                        </button>
                      ))}
                    </div>
                    <p style={{ fontSize: 11, color: "var(--text-label)", marginTop: 10 }}>
                      Currently: <strong style={{ color: "#a78bfa" }}>{currency.symbol} — {currency.label}</strong>
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* ── CONNECTIONS ── */}
            {activeTab === "connections" && (
              <>
                <div className="sp-card">
                  <SectionLabel>LINKED BANK ACCOUNTS</SectionLabel>
                  <div style={{ padding: "14px 20px" }}>
                    {connLoading && (
                      <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>Loading connections…</p>
                    )}
                    {!connLoading && connections.length === 0 && (
                      <div style={{ textAlign: "center", padding: "24px 0" }}>
                        <Wifi size={32} color="rgba(148,163,184,0.2)" style={{ marginBottom: 10 }} />
                        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>No bank accounts linked yet.</p>
                        <button
                          className="sp-action-btn primary"
                          style={{ marginTop: 14 }}
                          onClick={() => navigateTo("Transactions")}
                        >
                          Connect a Bank Account
                        </button>
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {connections.map(c => (
                        <div key={c.id} className="sp-conn-card">
                          <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Building2 size={18} color="#22d3ee" />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>
                              {c.bankName || "Bank Account"}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-muted)" }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor(c.consentStatus), display: "inline-block", flexShrink: 0 }} />
                              {statusLabel(c.consentStatus)}
                              {c.lastSyncedAt && <span>· Last synced {new Date(c.lastSyncedAt).toLocaleDateString()}</span>}
                            </div>
                          </div>
                          <button
                            className="sp-action-btn danger"
                            onClick={() => handleDisconnect(c.id)}
                          >
                            <Unlink size={12} style={{ display: "inline", marginRight: 5 }} />
                            Disconnect
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="sp-card">
                  <SectionLabel>ABOUT SETU AA</SectionLabel>
                  <div style={{ padding: "14px 20px" }}>
                    <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>
                      FinTwin connects via RBI's Account Aggregator framework. We never see your banking credentials — you only share the data you explicitly consent to, and you can revoke access anytime.
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* ── ACCOUNT ── */}
            {activeTab === "account" && (
              <>
                <div className="sp-card">
                  <SectionLabel>INFORMATION</SectionLabel>
                  <div className="sp-row">
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Email address</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{profile?.email || "—"}</div>
                    </div>
                    <button
                      className="sp-action-btn"
                      onClick={() => { navigator.clipboard.writeText(profile?.email || ""); toast.success("Email copied!"); }}
                    >
                      <Copy size={12} style={{ display: "inline", marginRight: 5 }} />
                      Copy
                    </button>
                  </div>
                  <div className="sp-row">
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Reset password</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Change your login password</div>
                    </div>
                    <button className="sp-action-btn" onClick={() => setShowPasswordModal(true)}>
                      <Lock size={12} style={{ display: "inline", marginRight: 5 }} />
                      Change
                    </button>
                  </div>
                  <div className="sp-row">
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Two-factor authentication</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: twoFaEnabled ? "#4ade80" : "rgba(148,163,184,0.3)", flexShrink: 0 }} />
                        <div style={{ fontSize: 12, color: twoFaEnabled ? "#4ade80" : "var(--text-muted)" }}>
                          {twoFaEnabled === null ? "Loading…" : twoFaEnabled ? "Enabled" : "Not enabled"}
                        </div>
                      </div>
                    </div>
                    <button
                      className={`sp-action-btn ${twoFaEnabled ? "danger" : "primary"}`}
                      onClick={() => setShowTwoFAModal(true)}
                    >
                      {twoFaEnabled
                        ? <><ShieldOff size={12} style={{ display: "inline", marginRight: 5 }} />Disable 2FA</>
                        : <><ShieldCheck size={12} style={{ display: "inline", marginRight: 5 }} />Enable 2FA</>
                      }
                    </button>
                  </div>
                </div>

                <div className="sp-card">
                  <SectionLabel>ACTIONS</SectionLabel>
                  <div className="sp-row">
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Restart onboarding</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Go through the setup wizard again</div>
                    </div>
                    <button className="sp-action-btn" onClick={() => { window.location.href = "/onboarding"; }}>
                      <RotateCcw size={12} style={{ display: "inline", marginRight: 5 }} />
                      Restart
                    </button>
                  </div>
                  <div className="sp-row">
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Export all transactions</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Download a CSV of your transaction history</div>
                    </div>
                    <button className="sp-action-btn" onClick={handleExportCSV}>
                      <Download size={12} style={{ display: "inline", marginRight: 5 }} />
                      Download
                    </button>
                  </div>
                  <div className="sp-row">
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Clear local cache</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Clears locally stored settings and preferences</div>
                    </div>
                    <button className="sp-action-btn" onClick={handleClearCache}>
                      <Database size={12} style={{ display: "inline", marginRight: 5 }} />
                      Clear cache
                    </button>
                  </div>
                </div>

                <div className="sp-card">
                  <SectionLabel>SESSION</SectionLabel>
                  <div className="sp-row">
                    <div style={{ display: "flex", gap: 10 }}>
                      <button className="sp-action-btn" onClick={handleLogout}>Log out</button>
                      <button className="sp-action-btn danger" onClick={() => setShowDeleteModal(true)}>
                        <Trash2 size={12} style={{ display: "inline", marginRight: 5 }} />
                        Delete account
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── AI PREFERENCES ── */}
            {activeTab === "ai" && (
              <>
                <div className="sp-card">
                  <SectionLabel>DEFAULT AI ADVISOR MODE</SectionLabel>
                  <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                    {AI_MODES.map(m => (
                      <div
                        key={m.id}
                        className={`sp-ai-card ${aiMode === m.id ? "selected" : ""}`}
                        onClick={() => setAiMode(m.id)}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 22 }}>{m.icon}</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: aiMode === m.id ? "#a78bfa" : "var(--text-primary)" }}>
                              {m.id}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{m.desc}</div>
                          </div>
                          {aiMode === m.id && (
                            <CheckCircle size={16} color="#a78bfa" style={{ marginLeft: "auto", flexShrink: 0 }} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="sp-card">
                  <SectionLabel>NOTIFICATIONS</SectionLabel>
                  <div className="sp-row">
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <Bell size={16} color="#fbbf24" />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Daily AI insights</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Receive a daily financial summary notification</div>
                      </div>
                    </div>
                    <Toggle on={dailyInsights} onChange={setDailyInsights} />
                  </div>
                </div>

                <button
                  onClick={handleSaveAI}
                  style={{
                    width: "100%", padding: "13px", borderRadius: 14, border: "none",
                    background: "linear-gradient(135deg,#a78bfa,#7c3aed)",
                    color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Save AI Preferences
                </button>
              </>
            )}

            {/* ── SUBSCRIPTION ── */}
            {activeTab === "subscription" && (
              <div className="sp-card">
                <SectionLabel>CURRENT PLAN</SectionLabel>
                <div style={{ padding: "24px 20px", textAlign: "center" }}>
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 26 }}>
                    ⚡
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#a78bfa", letterSpacing: "0.1em", marginBottom: 6 }}>CURRENT PLAN</div>
                  <h3 style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 6px" }}>FinTwin Free</h3>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 24px" }}>All core features included. Pro plan with advanced AI coming soon.</p>

                  <div style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 14, padding: "16px 20px", marginBottom: 20, textAlign: "left" }}>
                    {[
                      "AI Copilot with 5 advisor modes",
                      "Bank sync via Setu Account Aggregator",
                      "Executive reports & PDF export",
                      "Goals, budgets & net worth tracking",
                      "AES-256 field encryption",
                    ].map(f => (
                      <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, fontSize: 13, color: "var(--text-primary)" }}>
                        <CheckCircle size={14} color="#4ade80" style={{ flexShrink: 0 }} />
                        {f}
                      </div>
                    ))}
                  </div>

                  <div style={{ fontSize: 11, color: "var(--text-label)", padding: "10px 16px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
                    Pro plan with advanced AI models and priority support coming soon.
                  </div>
                </div>
              </div>
            )}

            {/* ── ABOUT ── */}
            {activeTab === "about" && (
              <div className="sp-card">
                <SectionLabel>APP INFORMATION</SectionLabel>
                <div style={{ padding: "14px 0" }}>
                  {[
                    { label: "Version", value: "v1.0.0" },
                    { label: "Encryption", value: "AES-256 GCM" },
                    { label: "Bank sync", value: "Setu Account Aggregator" },
                    { label: "AI engine", value: "Ollama / phi3:mini" },
                  ].map(row => (
                    <div key={row.label} className="sp-row">
                      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{row.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{row.value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "14px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="sp-action-btn" style={{ fontSize: 12 }} onClick={() => window.open('/privacy-policy', '_blank')}>
                    Privacy Policy <ChevronRight size={12} style={{ display: "inline", verticalAlign: "middle" }} />
                  </button>
                  <button className="sp-action-btn" style={{ fontSize: 12 }} onClick={() => window.open('/terms', '_blank')}>
                    Terms of Service <ChevronRight size={12} style={{ display: "inline", verticalAlign: "middle" }} />
                  </button>
                  <button className="sp-action-btn" style={{ fontSize: 12 }} onClick={() => { toast.success("Email us at support@fintwin.ai"); }}>
                    Support <ChevronRight size={12} style={{ display: "inline", verticalAlign: "middle" }} />
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}
