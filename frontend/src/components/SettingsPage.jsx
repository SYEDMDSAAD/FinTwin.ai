import { useState, useEffect, useRef } from "react";
import {
  Settings, Cpu, Shield, CreditCard, Info, Wifi,
  Copy, Download, Trash2, RotateCcw, Database,
  Bell, CheckCircle, ChevronRight, Building2,
  Unlink, Lock, X, ShieldCheck, ShieldOff, Moon, Check,
  Mic,
} from "lucide-react";
import { Button, IconChip } from "./ui";
import API, { identityApi } from "../services/api";
import toast from "react-hot-toast";
import { useTheme } from "../context/ThemeContext";
import { useCurrency, CURRENCIES } from "../context/CurrencyContext";
import ChangePasswordModal from "./ChangePasswordModal";
import DeleteAccountModal from "./DeleteAccountModal";
import { AI_MODES } from "../constants/aiModes";
import { wakePref, setWakePref } from "../utils/voicePref";
import { localPrefs, fetchAiPrefs, saveAiPrefs } from "../services/aiPrefs";
import { wakeWordConfigured } from "../services/voice";

const TABS = [
  { id: "general",      label: "General",        Icon: Settings   },
  { id: "connections",  label: "Connections",     Icon: Wifi       },
  { id: "account",      label: "Account",         Icon: Shield     },
  { id: "ai",           label: "AI Preferences",  Icon: Cpu        },
  { id: "subscription", label: "Subscription",    Icon: CreditCard },
  { id: "about",        label: "About",            Icon: Info       },
];

const CSS = `
  .sp-otp-box { width:44px; height:52px; border-radius:var(--radius-control); background:var(--bg-input); border:1px solid transparent; color:var(--text-primary); font-size:20px; font-weight:600; text-align:center; outline:none; font-family:inherit; font-variant-numeric:tabular-nums; }
  .sp-otp-box:focus { border-color:var(--accent); }
  @keyframes spOverlayIn { from{opacity:0} to{opacity:1} }
  @keyframes spModalIn { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  .sp-overlay { animation:spOverlayIn 0.2s ease both; }
  .sp-modal  { animation:spModalIn  0.25s ease both; }
  .sp-tabs { display:flex; gap:4px; overflow-x:auto; scrollbar-width:none; margin:0 -4px 20px; padding:0 4px; }
  .sp-tabs::-webkit-scrollbar { display:none; }
  .sp-tab-btn { display:inline-flex; align-items:center; gap:8px; height:36px; padding:0 14px; border-radius:999px; border:none; background:none; cursor:pointer; font-size:14px; font-weight:500; font-family:inherit; white-space:nowrap; flex-shrink:0; color:var(--text-dim); transition:background 0.15s,color 0.15s; }
  .sp-tab-btn:hover { color:var(--text-primary); }
  .sp-tab-btn.active { background:var(--bg-input); color:var(--text-primary); }
  .sp-row { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; gap:12px; flex-wrap:wrap; }
  .sp-row > div:first-child { flex:1; min-width:0; }
  .sp-row + .sp-row { border-top:1px solid var(--border-card); }
  .sp-action-btn { display:inline-flex; align-items:center; gap:6px; height:36px; padding:0 16px; border-radius:999px; border:none; background:var(--bg-input); color:var(--text-primary); font-size:14px; font-weight:600; cursor:pointer; font-family:inherit; white-space:nowrap; flex-shrink:0; transition:background 0.15s; }
  .sp-action-btn:hover { background:var(--bg-card-hover); }
  .sp-action-btn.danger { background:var(--bad-soft); color:var(--bad); }
  .sp-action-btn.primary { background:var(--accent-soft); color:var(--accent); }
  .sp-toggle { width:48px; height:28px; border-radius:99px; border:none; cursor:pointer; position:relative; transition:background 0.2s; flex-shrink:0; }
  .sp-toggle-thumb { position:absolute; top:3px; width:22px; height:22px; border-radius:50%; background:#fff; transition:transform 0.2s; box-shadow:0 1px 3px rgba(17,17,26,0.2); }
  .sp-card { background:var(--bg-card); border:1px solid var(--border-card); border-radius:var(--radius-card); overflow:hidden; margin-bottom:24px; }
  .sp-card-label { padding:0 4px 8px; font-size:17px; font-weight:600; letter-spacing:-0.01em; color:var(--text-primary); }
  .sp-ai-card { padding:12px 14px; border-radius:var(--radius-control); border:1px solid var(--border-card); background:var(--bg-card); cursor:pointer; transition:border-color 0.15s,background 0.15s; }
  .sp-ai-card.selected { background:var(--accent-soft); border-color:var(--accent); }
  .sp-ai-card:hover:not(.selected) { border-color:var(--border-card-hover); }
  .sp-conn-card { padding:14px 16px; border-radius:var(--radius-card); background:var(--bg-card); border:1px solid var(--border-card); display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
`;

function SectionLabel({ children }) {
  return <h3 className="sp-card-label">{children}</h3>;
}

function Toggle({ on, onChange, label }) {
  return (
    <button
      className="sp-toggle"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      style={{ background: on ? "var(--accent-strong)" : "var(--border-card-hover)" }}
    >
      <div className="sp-toggle-thumb" style={{ transform: on ? "translateX(23px)" : "translateX(3px)" }} />
    </button>
  );
}

// ── Inline 2FA modal ──────────────────────────────────────────────────────────

function TwoFAModal({ enabled, onClose, onSuccess }) {
  const [phase]      = useState(enabled ? "disable" : "setup");
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
        style={{ width: "100%", maxWidth: 440, background: "rgba(10,12,18,0.98)", border: "1px solid var(--border-card)", borderRadius: 24, overflow: "hidden", boxShadow: "0 40px 100px rgba(0,0,0,0.8)" }}
      >
        {/* Header */}
        <div style={{ height: 2, background: "linear-gradient(90deg,var(--accent),var(--accent))" }} />
        <div style={{ padding: "24px 28px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: phase === "disable" ? "var(--bad-soft)" : "var(--accent-soft)", border: `1px solid ${phase === "disable" ? "var(--bad-soft)" : "var(--accent)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {phase === "disable" ? <ShieldOff size={20} color="var(--bad)" /> : <ShieldCheck size={20} color="var(--accent)" />}
            </div>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: "#fff", margin: 0 }}>
                {phase === "disable" ? "Disable 2FA" : "Set up 2FA"}
              </h3>
              <p style={{ fontSize: 12, color: "var(--text-dim)", margin: 0 }}>
                {phase === "disable" ? "Enter your current authenticator code" : "Scan QR with your authenticator app"}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: "20px 28px 28px" }}>
          {/* Setup phase */}
          {phase === "setup" && (
            <>
              {qrLoading ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-dimmer)", fontSize: 13 }}>
                  Generating QR code…
                </div>
              ) : qrData ? (
                <>
                  <div style={{ display: "flex", gap: 18, alignItems: "flex-start", marginBottom: 20 }}>
                    <div style={{ background: "#fff", padding: 8, borderRadius: 12, flexShrink: 0 }}>
                      <img src={`data:image/png;base64,${qrData.qrCodeBase64}`} alt="2FA QR code" width={120} height={120} style={{ display: "block" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em", marginBottom: 6 }}>SETUP KEY</div>
                      <div
                        style={{ background: "var(--bg-input)", border: "1px solid var(--border-card)", borderRadius: 10, padding: "8px 12px", fontFamily: "monospace", fontSize: 11, color: "var(--accent)", letterSpacing: "0.12em", wordBreak: "break-all", marginBottom: 8 }}
                      >
                        {qrData.secret}
                      </div>
                      <p style={{ fontSize: 11, color: "rgba(100,116,139,0.5)", margin: 0, lineHeight: 1.5 }}>
                        Use if you can't scan the QR code. Keep this key safe.
                      </p>
                    </div>
                  </div>

                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em", marginBottom: 10 }}>
                    ENTER THE 6-DIGIT CODE TO CONFIRM
                  </div>
                  <OTPInputs />
                  <button
                    onClick={handleEnable}
                    disabled={submitting || otpCode.join("").length < 6}
                    style={{ marginTop: 18, width: "100%", padding: "13px", borderRadius: 13, border: "none", background: "var(--accent-strong)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: (submitting || otpCode.join("").length < 6) ? 0.6 : 1 }}
                  >
                    {submitting ? "Enabling…" : "Enable Two-Factor Auth"}
                  </button>
                </>
              ) : (
                <button onClick={loadSetup} style={{ width: "100%", padding: 13, borderRadius: 13, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Retry
                </button>
              )}
            </>
          )}

          {/* Disable phase */}
          {phase === "disable" && (
            <>
              <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 20, lineHeight: 1.6 }}>
                Open your authenticator app and enter the current 6-digit code to confirm.
              </p>
              <OTPInputs />
              <button
                onClick={handleDisable}
                disabled={submitting || otpCode.join("").length < 6}
                style={{ marginTop: 18, width: "100%", padding: "13px", borderRadius: 13, border: "1px solid var(--bad-soft)", background: "var(--bad-soft)", color: "var(--bad)", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: (submitting || otpCode.join("").length < 6) ? 0.6 : 1 }}
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
  const [heyFinTwin, setHeyFinTwin]         = useState(() => wakePref());
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal]     = useState(false);
  const [showTwoFAModal, setShowTwoFAModal]       = useState(false);
  const [twoFaEnabled,  setTwoFaEnabled]          = useState(null);
  const [profile, setProfile]               = useState(null);
  const [connections, setConnections]       = useState([]);
  const [connLoading, setConnLoading]       = useState(false);

  const [aiMode, setAiMode]               = useState(() => localPrefs().mode);
  const [dailyInsights, setDailyInsights] = useState(() => localPrefs().dailyInsights);
  useEffect(() => {
    let live = true;
    fetchAiPrefs().then((p) => { if (live) { setAiMode(p.mode); setDailyInsights(p.dailyInsights); } });
    return () => { live = false; };
  }, []);

  // Opt-in to using anonymised transactions to improve categorisation; off by default
  const [trainingConsent, setTrainingConsent] = useState(null);
  const fetchTrainingConsent = async () => {
    try { const r = await API.get("/profile/training-consent"); setTrainingConsent(r.data.given); } catch {}
  };
  const changeTrainingConsent = async (given) => {
    const before = trainingConsent;
    setTrainingConsent(given);
    try {
      const r = await API.put("/profile/training-consent", { given });
      setTrainingConsent(r.data.given);
      toast.success(given ? "Thanks — you're helping improve FinTwin's AI" : "Your data won't be used to improve the AI");
    } catch {
      setTrainingConsent(before);
      toast.error("Couldn't save that. Try again.");
    }
  };

  useEffect(() => { fetchProfile(); }, []);
  useEffect(() => { if (activeTab === "connections") fetchConnections(); }, [activeTab]);
  useEffect(() => { if (activeTab === "account") { fetchTwoFAStatus(); fetchTrainingConsent(); } }, [activeTab]);

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

  const handleSaveAI = async () => {
    try {
      await saveAiPrefs({ mode: aiMode, dailyInsights });
      toast.success("AI preferences saved");
    } catch {
      toast.error("Saved on this device only; couldn't reach the server");
    }
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
    if (status === "ACTIVE") return "var(--good)";
    if (status === "PENDING" || status === "FETCHING") return "var(--warn)";
    return "var(--bad)";
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

      <div className="sp-root max-w-2xl">
        <div className="sp-tabs" role="tablist" aria-label="Settings">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className={`sp-tab-btn ${activeTab === id ? "active" : ""}`}
                onClick={() => setActiveTab(id)}
                aria-current={activeTab === id ? "page" : undefined}
              >
                <Icon size={15} aria-hidden />
                {label}
              </button>
            ))}
        </div>
          <div>

            {/* ── GENERAL ── */}
            {activeTab === "general" && (
              <>
                {/* Appearance */}
                <SectionLabel>Appearance</SectionLabel>
                  <div className="sp-card">
                  <div className="sp-row">
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <IconChip icon={Moon} />
                      <div>
                        <div className="text-body text-ink">Dark mode</div>
                        <div className="text-small text-ink-3">Easier on the eyes at night</div>
                      </div>
                    </div>
                    <Toggle on={isDark} onChange={toggleTheme} label="Dark mode" />
                  </div>
                </div>

                {/* "Hey FinTwin" */}
                {wakeWordConfigured() && (
                  <>
                    <SectionLabel>Voice</SectionLabel>
                    <div className="sp-card">
                      <div className="sp-row">
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <IconChip icon={Mic} />
                          <div>
                            <div className="text-body text-ink">“Hey FinTwin”</div>
                            <div className="text-small text-ink-3">
                              Ask about your money out loud while FinTwin is open. Listening happens on this device; nothing is sent until you say “Hey FinTwin”.
                            </div>
                          </div>
                        </div>
                        <Toggle on={heyFinTwin} onChange={(on) => { setWakePref(on); setHeyFinTwin(on); }} label="Hey FinTwin" />
                      </div>
                    </div>
                  </>
                )}

                {/* Currency */}
                <SectionLabel>Currency</SectionLabel>
                  <div className="sp-card">
                  <div style={{ padding: "16px 20px" }}>
                    <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "0 0 12px" }}>
                      Amounts are shown in Indian rupees. Other currencies come once live exchange rates are in.
                    </p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {CURRENCIES.map(c => (
                        <button
                          key={c.code}
                          onClick={() => setCurrency(c)}
                          style={{
                            padding: "8px 16px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                            background: currency.code === c.code ? "var(--accent-soft)" : "var(--border-card)",
                            border: `1px solid ${currency.code === c.code ? "var(--accent)" : "var(--border-card)"}`,
                            color: currency.code === c.code ? "var(--accent)" : "var(--text-dim)",
                            fontSize: 13, fontWeight: 600, transition: "all 0.15s",
                          }}
                        >
                          {c.symbol} {c.code}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── CONNECTIONS ── */}
            {activeTab === "connections" && (
              <>
                <SectionLabel>Linked bank accounts</SectionLabel>
                  <div className="sp-card">
                  <div style={{ padding: "14px 20px" }}>
                    {connLoading && (
                      <p style={{ fontSize: 13, color: "var(--text-dim)", textAlign: "center", padding: "20px 0" }}>Loading connections…</p>
                    )}
                    {!connLoading && connections.length === 0 && (
                      <div style={{ textAlign: "center", padding: "24px 0" }}>
                        <Wifi size={32} color="rgba(148,163,184,0.2)" style={{ marginBottom: 10 }} />
                        <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0 }}>No bank accounts linked yet.</p>
                        <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "6px auto 0", maxWidth: 380, lineHeight: 1.55 }}>
                          Bank linking is a demo and isn't switched on during the beta. Please import a bank or UPI statement instead.
                        </p>
                        <button
                          className="sp-action-btn primary"
                          style={{ marginTop: 14 }}
                          onClick={() => navigateTo("Imports")}
                        >
                          Import a Statement
                        </button>
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {connections.map(c => (
                        <div key={c.id} className="sp-conn-card">
                          <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--accent-soft)", border: "1px solid var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Building2 size={18} color="var(--accent)" />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>
                              {c.bankName || "Bank Account"}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-dim)" }}>
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

                <SectionLabel>About Setu AA</SectionLabel>
                  <div className="sp-card">
                  <div style={{ padding: "14px 20px" }}>
                    <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, margin: 0 }}>
                      FinTwin connects via RBI's Account Aggregator framework. We never see your banking credentials — you only share the data you explicitly consent to, and you can revoke access anytime. During the beta this is a demo with Setu's test banks and isn't switched on, so import a statement for your real data.
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* ── ACCOUNT ── */}
            {activeTab === "account" && (
              <>
                <SectionLabel>Information</SectionLabel>
                  <div className="sp-card">
                  <div className="sp-row">
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 2 }}>Email address</div>
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
                      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Change your login password</div>
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
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: twoFaEnabled ? "var(--good)" : "rgba(148,163,184,0.3)", flexShrink: 0 }} />
                        <div style={{ fontSize: 12, color: twoFaEnabled ? "var(--good)" : "var(--text-dim)" }}>
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

                <SectionLabel>Actions</SectionLabel>
                  <div className="sp-card">
                  <div className="sp-row">
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Restart onboarding</div>
                      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Go through the setup wizard again</div>
                    </div>
                    <button className="sp-action-btn" onClick={() => { window.location.href = "/onboarding"; }}>
                      <RotateCcw size={12} style={{ display: "inline", marginRight: 5 }} />
                      Restart
                    </button>
                  </div>
                  <div className="sp-row">
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Export all transactions</div>
                      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Download a CSV of your transaction history</div>
                    </div>
                    <button className="sp-action-btn" onClick={handleExportCSV}>
                      <Download size={12} style={{ display: "inline", marginRight: 5 }} />
                      Download
                    </button>
                  </div>
                  <div className="sp-row">
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Clear local cache</div>
                      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Clears locally stored settings and preferences</div>
                    </div>
                    <button className="sp-action-btn" onClick={handleClearCache}>
                      <Database size={12} style={{ display: "inline", marginRight: 5 }} />
                      Clear cache
                    </button>
                  </div>
                </div>

                <SectionLabel>Data and privacy</SectionLabel>
                  <div className="sp-card">
                  <div className="sp-row">
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <Cpu size={16} color="var(--accent)" style={{ flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Help improve FinTwin's AI</div>
                        <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.55, maxWidth: 520 }}>
                          Let FinTwin use your transaction descriptions, the categories you pick, and the Copilot answers
                          you rate 👍 or 👎 to improve its AI. Our team may read the answers you rate to fix what went wrong.
                          People's names, phone numbers and UPI IDs are removed before any training. Off unless you turn
                          it on; you can turn it off any time.{" "}
                          <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Privacy policy</a>
                        </div>
                      </div>
                    </div>
                    {trainingConsent !== null && (
                      <Toggle on={trainingConsent} onChange={changeTrainingConsent} label="Help improve FinTwin's AI" />
                    )}
                  </div>
                </div>

                <SectionLabel>Session</SectionLabel>
                  <div className="sp-card">
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
                <SectionLabel>How Copilot talks to you</SectionLabel>
                  <div className="sp-card">
                  <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                    {AI_MODES.map(m => (
                      <div
                        key={m.id}
                        className={`sp-ai-card ${aiMode === m.id ? "selected" : ""}`}
                        onClick={() => setAiMode(m.id)}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: aiMode === m.id ? "var(--accent)" : "var(--text-primary)" }}>
                              {m.id}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{m.desc}</div>
                          </div>
                          {aiMode === m.id && (
                            <CheckCircle size={16} color="var(--accent)" style={{ marginLeft: "auto", flexShrink: 0 }} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <SectionLabel>Notifications</SectionLabel>
                  <div className="sp-card">
                  <div className="sp-row">
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <Bell size={16} color="var(--warn)" />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Daily AI insights</div>
                        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Show what changed since you last looked, on Home</div>
                      </div>
                    </div>
                    <Toggle on={dailyInsights} onChange={setDailyInsights} />
                  </div>
                </div>

                <Button size="lg" onClick={handleSaveAI}>Save</Button>
              </>
            )}

            {/* ── SUBSCRIPTION ── */}
            {activeTab === "subscription" && (
              <>
                <div className="px-1 mb-6">
                  <p className="text-small text-ink-3">Your plan</p>
                  <p className="text-display text-ink mt-1">FinTwin Free</p>
                  <p className="text-body text-ink-2 mt-1">Everything below is included. A Pro plan is on the way.</p>
                </div>
                <ul className="sp-card divide-y divide-line">
                  {[
                    "Copilot, in five styles",
                    "Bank SMS, statements and receipts",
                    "Reports you can save as PDF",
                    "Goals, budgets and net worth",
                    "Encrypted personal data",
                  ].map(f => (
                    <li key={f} className="flex items-center gap-3 px-4 py-3.5 text-body text-ink">
                      <Check size={16} aria-hidden className="text-good shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* ── ABOUT ── */}
            {activeTab === "about" && (
              <>
              <SectionLabel>App information</SectionLabel>
                <div className="sp-card">
                  <div className="sp-row">
                    <span className="text-body text-ink">Version</span>
                    <span className="text-body text-ink-3 num">1.0.0</span>
                  </div>
                <div style={{ padding: "14px 16px", borderTop: "1px solid var(--border-card)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="sp-action-btn" onClick={() => window.open('/privacy-policy', '_blank')}>
                    Privacy policy <ChevronRight size={12} style={{ display: "inline", verticalAlign: "middle" }} />
                  </button>
                  <button className="sp-action-btn" onClick={() => window.open('/terms', '_blank')}>
                    Terms <ChevronRight size={12} style={{ display: "inline", verticalAlign: "middle" }} />
                  </button>
                  <button className="sp-action-btn" onClick={() => { toast.success("Email us at support@fintwin.ai"); }}>
                    Support <ChevronRight size={12} style={{ display: "inline", verticalAlign: "middle" }} />
                  </button>
                </div>
              </div>
              </>
            )}

          </div>
      </div>
    </>
  );
}
