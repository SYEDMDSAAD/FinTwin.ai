import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import API, { identityApi } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { GoogleLogin } from "@react-oauth/google";
import { Mail, Lock, Eye, EyeOff, Shield, ArrowLeft, AlertOctagon, MessageSquare, X, User } from "lucide-react";

const CSS = `
  .auth-page * { box-sizing: border-box; }
  .auth-page { font-family: 'DM Sans', system-ui, sans-serif; }

  .auth-input-wrap { display:flex; align-items:center; gap:12px; border-radius:13px; padding:0 16px; transition:all 0.2s; }
  .auth-input-wrap:focus-within { box-shadow:0 0 0 3px rgba(124,58,237,0.10) !important; }
  .auth-input { width:100%; background:transparent; padding:14px 0; font-size:14px; outline:none; font-family:inherit; }
  .auth-btn { width:100%; padding:14px; border-radius:13px; border:none; font-size:14px; font-weight:700; cursor:pointer; transition:all 0.22s; font-family:inherit; letter-spacing:0.02em; }
  .auth-btn:hover:not(:disabled) { opacity:0.92; transform:translateY(-1px); box-shadow:0 8px 28px rgba(124,58,237,0.30); }
  .auth-btn:disabled { opacity:0.5; cursor:not-allowed; }
  .auth-link { cursor:pointer; font-weight:600; transition:color 0.15s; }
  .otp-box { width:48px; height:56px; border-radius:13px; font-size:22px; font-weight:700; text-align:center; outline:none; font-family:inherit; transition:all 0.2s; }
  .otp-box:focus { box-shadow:0 0 0 3px rgba(124,58,237,0.10); }
  .ticket-select { border-radius:13px; padding:14px 16px; font-size:14px; outline:none; font-family:inherit; width:100%; cursor:pointer; border:1px solid rgba(255,255,255,0.09); background:rgba(255,255,255,0.04); color:#e2e8f0; }
  .ticket-select option { background:#0e1018; color:#e2e8f0; }
  .ticket-textarea { width:100%; border-radius:13px; padding:14px 16px; font-size:14px; outline:none; font-family:inherit; resize:vertical; min-height:110px; border:1px solid rgba(255,255,255,0.09); background:rgba(255,255,255,0.04); color:#e2e8f0; }
  .ticket-textarea::placeholder { color:rgba(100,116,139,0.5); }

  @keyframes authFade { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
  .auth-fade { animation: authFade 0.45s cubic-bezier(0.22,1,0.36,1) both; }

  @keyframes orbFloat1 { 0%,100%{transform:translate(0,0)} 33%{transform:translate(34px,-28px)} 66%{transform:translate(-22px,26px)} }
  @keyframes orbFloat2 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,36px)} }
  @keyframes orbFloat3 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(26px,-22px)} }
  @keyframes sf1 { 0%,100%{transform:translate(0,0) rotate(0deg)} 50%{transform:translate(13px,-18px) rotate(90deg)} }
  @keyframes sf2 { 0%,100%{transform:translate(0,0) rotate(45deg)} 50%{transform:translate(-12px,15px) rotate(135deg)} }
  @keyframes sf3 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(10px,-14px) scale(1.22)} }
  @keyframes sf4 { 0%,100%{transform:translate(0,0) rotate(0deg)} 50%{transform:translate(-15px,11px) rotate(180deg)} }
  @keyframes sf5 { 0%,100%{transform:translate(0,0) rotate(45deg) scale(1)} 50%{transform:translate(11px,17px) rotate(225deg) scale(1.14)} }

  .l-orb { position:fixed; border-radius:50%; pointer-events:none; }
  .l-orb-1 { top:-12%; right:-8%; width:600px; height:600px; background:radial-gradient(circle, rgba(167,139,250,0.28) 0%, transparent 65%); filter:blur(68px); animation:orbFloat1 14s ease-in-out infinite; }
  .l-orb-2 { bottom:-18%; left:-8%; width:540px; height:540px; background:radial-gradient(circle, rgba(34,211,238,0.20) 0%, transparent 65%); filter:blur(60px); animation:orbFloat2 18s ease-in-out infinite; }
  .l-orb-3 { top:35%; left:8%; width:320px; height:320px; background:radial-gradient(circle, rgba(99,102,241,0.16) 0%, transparent 65%); filter:blur(46px); animation:orbFloat3 12s ease-in-out infinite; }

  .l-shape { position:fixed; pointer-events:none; }
  .l-shape-1 { top:11%; left:7%;  width:22px; height:22px; border-radius:6px;  background:rgba(167,139,250,0.22); border:1.5px solid rgba(167,139,250,0.44); animation:sf1 9s ease-in-out infinite; }
  .l-shape-2 { top:27%; right:9%; width:14px; height:14px; border-radius:50%;  background:rgba(34,211,238,0.28);  border:1.5px solid rgba(34,211,238,0.52);  animation:sf2 12s ease-in-out infinite; }
  .l-shape-3 { bottom:27%; left:5%; width:18px; height:18px; border-radius:50%; border:2px solid rgba(99,102,241,0.34); animation:sf3 8s ease-in-out infinite; }
  .l-shape-4 { top:63%; right:6%; width:16px; height:16px; border-radius:4px;  background:rgba(167,139,250,0.20); border:1.5px solid rgba(167,139,250,0.38); animation:sf4 11s ease-in-out infinite; }
  .l-shape-5 { bottom:11%; right:17%; width:12px; height:12px; background:rgba(34,211,238,0.24); border:1.5px solid rgba(34,211,238,0.44); animation:sf5 7.5s ease-in-out infinite; }
`;

const CATEGORIES = [
  { value: "LOGIN_ISSUE",     label: "Login Issue" },
  { value: "ACCOUNT_BLOCKED", label: "Account Blocked" },
  { value: "BUG",             label: "Bug / Technical Issue" },
  { value: "BILLING",         label: "Billing" },
  { value: "OTHER",           label: "Other" },
];

function TicketModal({ defaultEmail = "", onClose }) {
  const [tEmail,    setTEmail]    = useState(defaultEmail);
  const [tName,     setTName]     = useState("");
  const [tCategory, setTCategory] = useState(defaultEmail ? "ACCOUNT_BLOCKED" : "OTHER");
  const [tMessage,  setTMessage]  = useState("");
  const [loading,   setLoading]   = useState(false);
  const [success,   setSuccess]   = useState(false);

  const submit = async () => {
    if (!tEmail.trim() || !tMessage.trim()) { toast.error("Email and message are required"); return; }
    try {
      setLoading(true);
      await API.post("/tickets", { email: tEmail.trim(), name: tName.trim(), category: tCategory, message: tMessage.trim() });
      setSuccess(true);
    } catch { toast.error("Failed to submit. Please try again."); }
    finally { setLoading(false); }
  };

  return (
    <div
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.78)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:20, backdropFilter:"blur(8px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="auth-fade" style={{ width:"100%", maxWidth:460, background:"#0e1018", border:"1px solid rgba(255,255,255,0.1)", borderRadius:24, padding:"32px 28px", position:"relative", overflowY:"auto", maxHeight:"90vh" }}>
        <button onClick={onClose} style={{ position:"absolute", top:16, right:16, background:"none", border:"none", color:"rgba(148,163,184,0.5)", cursor:"pointer", padding:4, display:"flex" }}>
          <X size={18}/>
        </button>
        {success ? (
          <div style={{ textAlign:"center", padding:"24px 0" }}>
            <div style={{ width:56, height:56, borderRadius:"50%", background:"rgba(52,211,153,0.1)", border:"1px solid rgba(52,211,153,0.25)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 18px" }}>
              <MessageSquare size={24} color="#34d399"/>
            </div>
            <h2 style={{ fontSize:19, fontWeight:800, color:"#fff", margin:"0 0 8px" }}>Ticket Submitted!</h2>
            <p style={{ fontSize:13, color:"rgba(148,163,184,0.6)", margin:"0 0 28px", lineHeight:1.6 }}>
              Our support team will respond to <strong style={{ color:"#e2e8f0" }}>{tEmail}</strong> shortly.
            </p>
            <button className="auth-btn" onClick={onClose} style={{ background:"linear-gradient(135deg,#a78bfa,#7c3aed)", color:"#fff" }}>Close</button>
          </div>
        ) : (
          <>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:26 }}>
              <div style={{ width:40, height:40, borderRadius:12, background:"rgba(167,139,250,0.1)", border:"1px solid rgba(167,139,250,0.2)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <MessageSquare size={19} color="#a78bfa"/>
              </div>
              <div>
                <div style={{ fontSize:16, fontWeight:800, color:"#fff" }}>Raise a Support Ticket</div>
                <div style={{ fontSize:11, color:"rgba(148,163,184,0.5)" }}>We'll reply directly to your email</div>
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:"rgba(148,163,184,0.6)", letterSpacing:"0.08em", display:"block", marginBottom:8 }}>YOUR EMAIL *</label>
                <div className="auth-input-wrap" style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)" }}>
                  <Mail size={15} color="rgba(148,163,184,0.4)"/>
                  <input className="auth-input" style={{ color:"#e2e8f0" }} type="email" placeholder="you@example.com" value={tEmail} onChange={e=>setTEmail(e.target.value)}/>
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:"rgba(148,163,184,0.6)", letterSpacing:"0.08em", display:"block", marginBottom:8 }}>YOUR NAME</label>
                <div className="auth-input-wrap" style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)" }}>
                  <User size={15} color="rgba(148,163,184,0.4)"/>
                  <input className="auth-input" style={{ color:"#e2e8f0" }} type="text" placeholder="Optional" value={tName} onChange={e=>setTName(e.target.value)}/>
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:"rgba(148,163,184,0.6)", letterSpacing:"0.08em", display:"block", marginBottom:8 }}>CATEGORY</label>
                <select className="ticket-select" value={tCategory} onChange={e=>setTCategory(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:"rgba(148,163,184,0.6)", letterSpacing:"0.08em", display:"block", marginBottom:8 }}>DESCRIBE YOUR ISSUE *</label>
                <textarea className="ticket-textarea" placeholder="Please describe your problem in detail…" value={tMessage} onChange={e=>setTMessage(e.target.value)}/>
              </div>
              <button className="auth-btn" onClick={submit}
                disabled={loading || !tEmail.trim() || !tMessage.trim()}
                style={{ background:"linear-gradient(135deg,#a78bfa,#7c3aed)", color:"#fff" }}>
                {loading ? "Submitting…" : "Submit Ticket →"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Login() {
  const navigate = useNavigate();
  const { login }  = useAuth();
  const { isDark } = useTheme();

  const [email,           setEmail]           = useState("");
  const [password,        setPassword]        = useState("");
  const [showPw,          setShowPw]          = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [accountBlocked,  setAccountBlocked]  = useState(false);
  const [needs2FA,        setNeeds2FA]        = useState(false);
  const [twoFactorToken,  setTwoFactorToken]  = useState("");
  const [otpCode,         setOtpCode]         = useState(["","","","","",""]);
  const [otpLoading,      setOtpLoading]      = useState(false);
  const otpRefs = useRef([]);
  const [showTicket,         setShowTicket]         = useState(false);
  const [ticketDefaultEmail, setTicketDefaultEmail] = useState("");

  // Forgot password state
  const [showForgot,       setShowForgot]       = useState(false);
  const [forgotEmail,      setForgotEmail]      = useState("");
  const [forgotLoading,    setForgotLoading]    = useState(false);
  const [forgotSent,       setForgotSent]       = useState(false);

  const handleLogin = async () => {
    if (!email || !password) { toast.error("Enter your email and password"); return; }
    try {
      setLoading(true);
      setAccountBlocked(false);
      const res = await identityApi.post("/auth/login", { email, password });
      if (res.data.requires2FA) { setTwoFactorToken(res.data.twoFactorToken); setNeeds2FA(true); return; }
      login(res.data.accessToken, { email: res.data.email, fullName: res.data.fullName, role: res.data.role }, res.data.refreshToken);
      toast.success("Login Successful");
      const me = await identityApi.get("/auth/me");
      navigate(me.data.onboardingCompleted ? "/dashboard" : "/onboarding", { replace: true });
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.error === "ACCOUNT_DISABLED") {
        setAccountBlocked(true); setTicketDefaultEmail(email);
      } else { setAccountBlocked(false); toast.error("Invalid Credentials"); }
    } finally { setLoading(false); }
  };

  const handleOTPChange = (index, value) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...otpCode]; next[index] = value; setOtpCode(next);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };
  const handleOTPKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otpCode[index] && index > 0) otpRefs.current[index - 1]?.focus();
  };
  const handleOTPPaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g,"").slice(0,6);
    if (!pasted) return; e.preventDefault();
    const next = [...otpCode]; pasted.split("").forEach((ch,i) => { next[i] = ch; }); setOtpCode(next);
    otpRefs.current[Math.min(pasted.length,5)]?.focus();
  };
  const handle2FASubmit = async () => {
    const code = otpCode.join("");
    if (code.length < 6) { toast.error("Enter the 6-digit code"); return; }
    try {
      setOtpLoading(true);
      const res = await identityApi.post("/auth/2fa/login", { twoFactorToken, code });
      login(res.data.accessToken, { email: res.data.email, fullName: res.data.fullName, role: res.data.role }, res.data.refreshToken);
      toast.success("Login Successful");
      const me = await identityApi.get("/auth/me");
      navigate(me.data.onboardingCompleted ? "/dashboard" : "/onboarding", { replace: true });
    } catch (err) {
      const msg = err.response?.data?.error || "Invalid code. Try again.";
      toast.error(msg);
      if (msg.includes("expired")) { setNeeds2FA(false); setOtpCode(["","","","","",""]); }
    } finally { setOtpLoading(false); }
  };
  const handleGoogleLogin = async (credentialResponse) => {
    try {
      const res = await identityApi.post("/auth/google", { credential: credentialResponse.credential });
      login(res.data.accessToken, { email: res.data.email, fullName: res.data.fullName, role: res.data.role }, res.data.refreshToken);
      toast.success("Google Login Successful");
      const me = await identityApi.get("/auth/me");
      navigate(me.data.onboardingCompleted ? "/dashboard" : "/onboarding", { replace: true });
    } catch { toast.error("Google Login Failed"); }
  };
  const openTicket = (prefillEmail = "") => { setTicketDefaultEmail(prefillEmail); setShowTicket(true); };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) { toast.error("Enter your email address"); return; }
    try {
      setForgotLoading(true);
      const res = await identityApi.post("/auth/forgot-password", { email: forgotEmail.trim() });
      // Dev mode: backend returns the reset URL directly when email is not configured
      if (res.data?.devResetUrl) {
        toast.success("Dev mode: opening reset link directly");
        window.open(res.data.devResetUrl, "_blank");
      }
      setForgotSent(true);
    } catch (e) {
      const msg = e.response?.data?.error || "Something went wrong. Try again.";
      toast.error(msg);
    } finally { setForgotLoading(false); }
  };

  /* ── theme-derived tokens ─────────────────────────── */
  const pageBg    = isDark ? "#080a0f" : "linear-gradient(135deg, #eef2fa 0%, #e3eaf7 48%, #ede8fb 100%)";
  const cardBg    = isDark ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.88)";
  const cardBdr   = isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)";
  const cardShd   = isDark ? "0 40px 100px rgba(0,0,0,0.5)" : "0 24px 64px rgba(15,23,42,0.13), 0 4px 20px rgba(15,23,42,0.06)";
  const accentH   = isDark ? 1 : 3;
  const txt       = isDark ? "#fff"                      : "#0f172a";
  const txtSub    = isDark ? "rgba(148,163,184,0.5)"     : "rgba(71,85,105,0.75)";
  const txtLabel  = isDark ? "rgba(148,163,184,0.6)"     : "rgba(71,85,105,0.70)";
  const inputBg   = isDark ? "rgba(255,255,255,0.04)"    : "rgba(15,23,42,0.04)";
  const inputBdr  = isDark ? "1px solid rgba(255,255,255,0.09)" : "1px solid rgba(15,23,42,0.10)";
  const inputClr  = isDark ? "#e2e8f0"                   : "#0f172a";
  const divider   = isDark ? "rgba(255,255,255,0.07)"    : "rgba(15,23,42,0.08)";
  const linkClr   = isDark ? "#a78bfa"                   : "#7c3aed";
  const otpBg     = isDark ? "rgba(255,255,255,0.04)"    : "rgba(15,23,42,0.04)";
  const otpBdr    = isDark ? "rgba(255,255,255,0.09)"    : "rgba(15,23,42,0.10)";

  return (
    <>
      <style>{CSS}</style>
      {showTicket && <TicketModal defaultEmail={ticketDefaultEmail} onClose={() => setShowTicket(false)}/>}

      {/* Forgot password modal */}
      {showForgot && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.78)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:20, backdropFilter:"blur(8px)" }}
          onClick={e => e.target === e.currentTarget && setShowForgot(false)}>
          <div className="auth-fade" style={{ width:"100%", maxWidth:420, background:"#0e1018", border:"1px solid rgba(255,255,255,0.1)", borderRadius:24, padding:"32px 28px", position:"relative" }}>
            <button onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(""); }}
              style={{ position:"absolute", top:16, right:16, background:"none", border:"none", color:"rgba(148,163,184,0.5)", cursor:"pointer", padding:4, display:"flex" }}>
              <X size={18}/>
            </button>
            {forgotSent ? (
              <div style={{ textAlign:"center", padding:"16px 0" }}>
                <div style={{ width:52, height:52, borderRadius:"50%", background:"rgba(52,211,153,0.1)", border:"1px solid rgba(52,211,153,0.25)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
                  <Mail size={22} color="#34d399"/>
                </div>
                <h2 style={{ fontSize:18, fontWeight:800, color:"#fff", margin:"0 0 8px" }}>Check your inbox</h2>
                <p style={{ fontSize:13, color:"rgba(148,163,184,0.6)", margin:"0 0 24px", lineHeight:1.6 }}>
                  If <strong style={{ color:"#e2e8f0" }}>{forgotEmail}</strong> is registered, a password reset link has been sent. Check spam if you don't see it.
                </p>
                <button className="auth-btn" onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(""); }}
                  style={{ background:"linear-gradient(135deg,#a78bfa,#7c3aed)", color:"#fff" }}>Back to Sign In</button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom:24 }}>
                  <h2 style={{ fontSize:20, fontWeight:800, color:"#fff", margin:"0 0 6px" }}>Reset your password</h2>
                  <p style={{ fontSize:13, color:"rgba(148,163,184,0.5)", margin:0 }}>Enter your email and we'll send a reset link.</p>
                </div>
                <div style={{ marginBottom:20 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:"rgba(148,163,184,0.6)", letterSpacing:"0.08em", display:"block", marginBottom:8 }}>EMAIL ADDRESS</label>
                  <div className="auth-input-wrap" style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)" }}>
                    <Mail size={15} color="rgba(148,163,184,0.4)"/>
                    <input className="auth-input" style={{ color:"#e2e8f0" }} type="email" placeholder="you@example.com"
                      value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleForgotPassword()} autoFocus/>
                  </div>
                </div>
                <button className="auth-btn" onClick={handleForgotPassword} disabled={forgotLoading || !forgotEmail.trim()}
                  style={{ background:"linear-gradient(135deg,#a78bfa,#7c3aed)", color:"#fff" }}>
                  {forgotLoading ? "Sending…" : "Send Reset Link →"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="auth-page" style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:pageBg, position:"relative", overflow:"hidden", padding:20 }}>

        {/* Light mode: dot grid */}
        {!isDark && (
          <div style={{ position:"fixed", inset:0, pointerEvents:"none", backgroundImage:"radial-gradient(rgba(99,102,241,0.07) 1px, transparent 1px)", backgroundSize:"28px 28px" }}/>
        )}

        {/* Light mode: animated orbs + shapes */}
        {!isDark && (
          <>
            <div className="l-orb l-orb-1"/><div className="l-orb l-orb-2"/><div className="l-orb l-orb-3"/>
            <div className="l-shape l-shape-1"/><div className="l-shape l-shape-2"/><div className="l-shape l-shape-3"/>
            <div className="l-shape l-shape-4"/><div className="l-shape l-shape-5"/>
          </>
        )}

        {/* Dark mode: existing orbs */}
        {isDark && (
          <>
            <div style={{ position:"fixed", top:"-15%", left:"-10%", width:500, height:500, borderRadius:"50%", background:"radial-gradient(circle,rgba(167,139,250,0.1) 0%,transparent 70%)", pointerEvents:"none" }}/>
            <div style={{ position:"fixed", bottom:"-10%", right:"5%", width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle,rgba(34,211,238,0.07) 0%,transparent 70%)", pointerEvents:"none" }}/>
          </>
        )}

        {/* ── Card ── */}
        <div className="auth-fade" style={{ width:"100%", maxWidth:440, background:cardBg, border:cardBdr, borderRadius:24, padding:"40px 36px", backdropFilter:"blur(24px)", boxShadow:cardShd, position:"relative", overflow:"hidden" }}>

          {/* Top accent bar */}
          <div style={{ position:"absolute", top:0, left:0, right:0, height:accentH, background:"linear-gradient(90deg, #a78bfa, #7c3aed 40%, #22d3ee)" }}/>

          {/* Logo */}
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:32 }}>
            <div style={{ width:38, height:38, borderRadius:11, background:"linear-gradient(135deg,#a78bfa,#22d3ee)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, fontWeight:800, color:"#fff", flexShrink:0 }}>F</div>
            <div>
              <div style={{ fontSize:14, fontWeight:800, color:txt, letterSpacing:"-0.02em" }}>FinTwin AI</div>
              <div style={{ fontSize:10, color:txtSub, letterSpacing:"0.06em" }}>FINANCIAL OS</div>
            </div>
          </div>

          {/* ── 2FA step ── */}
          {needs2FA ? (
            <div key="2fa">
              <button onClick={() => { setNeeds2FA(false); setOtpCode(["","","","","",""]); }}
                style={{ background:"none", border:"none", color:linkClr, fontSize:13, cursor:"pointer", fontFamily:"inherit", padding:0, display:"flex", alignItems:"center", gap:6, marginBottom:24 }}>
                <ArrowLeft size={14}/> Back
              </button>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
                <div style={{ width:44, height:44, borderRadius:12, background:"rgba(167,139,250,0.1)", border:"1px solid rgba(167,139,250,0.25)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <Shield size={22} color="#a78bfa"/>
                </div>
                <div>
                  <h2 style={{ fontSize:20, fontWeight:800, color:txt, margin:0, letterSpacing:"-0.02em" }}>Two-factor auth</h2>
                  <p style={{ fontSize:12, color:txtSub, margin:0 }}>Open your authenticator app</p>
                </div>
              </div>
              <p style={{ fontSize:13, color:txtSub, marginBottom:28, lineHeight:1.6 }}>Enter the 6-digit code from your authenticator app to complete sign in.</p>
              <div style={{ display:"flex", gap:10, justifyContent:"center", marginBottom:28 }}>
                {otpCode.map((digit, i) => (
                  <input key={i} ref={el => (otpRefs.current[i] = el)} className="otp-box"
                    style={{ background:otpBg, border:`1px solid ${otpBdr}`, color:inputClr }}
                    type="text" inputMode="numeric" maxLength={1} value={digit}
                    onChange={e => handleOTPChange(i, e.target.value)}
                    onKeyDown={e => handleOTPKeyDown(i, e)}
                    onPaste={i === 0 ? handleOTPPaste : undefined}
                    autoFocus={i === 0}/>
                ))}
              </div>
              <button className="auth-btn" onClick={handle2FASubmit}
                disabled={otpLoading || otpCode.join("").length < 6}
                style={{ background:"linear-gradient(135deg,#a78bfa,#7c3aed)", color:"#fff" }}>
                {otpLoading ? "Verifying…" : "Verify & Sign In →"}
              </button>
            </div>

          ) : (
            /* ── Credentials step ── */
            <div key="creds">
              <div style={{ marginBottom:28 }}>
                <h1 style={{ fontSize:26, fontWeight:800, color:txt, margin:"0 0 6px", letterSpacing:"-0.03em" }}>Welcome back</h1>
                <p style={{ fontSize:13, color:txtSub, margin:0 }}>Sign in to your FinTwin account</p>
              </div>

              {accountBlocked && (
                <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:13, padding:"14px 16px", marginBottom:20, display:"flex", gap:12, alignItems:"flex-start" }}>
                  <AlertOctagon size={18} color="#f87171" style={{ flexShrink:0, marginTop:1 }}/>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:"#f87171", marginBottom:4 }}>Account Blocked</div>
                    <div style={{ fontSize:12, color:"rgba(239,68,68,0.7)", lineHeight:1.6 }}>Your account has been disabled. Please raise a support ticket and our team will assist you.</div>
                    <button onClick={() => openTicket(ticketDefaultEmail)}
                      style={{ marginTop:10, background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, padding:"7px 14px", color:"#f87171", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit", display:"inline-flex", alignItems:"center", gap:6 }}>
                      <MessageSquare size={13}/> Raise a Ticket
                    </button>
                  </div>
                </div>
              )}

              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:11, fontWeight:700, color:txtLabel, letterSpacing:"0.08em", display:"block", marginBottom:8 }}>EMAIL ADDRESS</label>
                <div className="auth-input-wrap" style={{ background:inputBg, border:inputBdr }}>
                  <Mail size={15} color="rgba(148,163,184,0.5)"/>
                  <input className="auth-input" style={{ color:inputClr }} type="email" placeholder="you@example.com" value={email}
                    onChange={e => { setEmail(e.target.value); setAccountBlocked(false); }}
                    onKeyDown={e => e.key === "Enter" && handleLogin()}/>
                </div>
              </div>

              <div style={{ marginBottom:8 }}>
                <label style={{ fontSize:11, fontWeight:700, color:txtLabel, letterSpacing:"0.08em", display:"block", marginBottom:8 }}>PASSWORD</label>
                <div className="auth-input-wrap" style={{ background:inputBg, border:inputBdr }}>
                  <Lock size={15} color="rgba(148,163,184,0.5)"/>
                  <input className="auth-input" style={{ color:inputClr }} type={showPw ? "text" : "password"} placeholder="••••••••" value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleLogin()}/>
                  <button onClick={() => setShowPw(!showPw)} style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(148,163,184,0.5)", padding:0, display:"flex", alignItems:"center" }}>
                    {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                  </button>
                </div>
              </div>

              <div style={{ textAlign:"right", marginBottom:20 }}>
                <span className="auth-link" style={{ fontSize:12, color:linkClr }}
                  onClick={() => { setForgotEmail(email); setForgotSent(false); setShowForgot(true); }}>
                  Forgot password?
                </span>
              </div>

              <button className="auth-btn" onClick={handleLogin} disabled={loading}
                style={{ background:"linear-gradient(135deg,#a78bfa,#7c3aed)", color:"#fff", marginBottom:20 }}>
                {loading ? "Signing in…" : "Sign In →"}
              </button>

              <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
                <div style={{ flex:1, height:1, background:divider }}/>
                <span style={{ fontSize:11, color:txtSub, letterSpacing:"0.08em" }}>OR</span>
                <div style={{ flex:1, height:1, background:divider }}/>
              </div>

              <div style={{ display:"flex", justifyContent:"center", marginBottom:24 }}>
                <GoogleLogin onSuccess={handleGoogleLogin} onError={() => toast.error("Google Login Failed")} theme="filled_black" shape="pill" size="large" width="320"/>
              </div>

              <div style={{ display:"flex", flexDirection:"column", gap:10, alignItems:"center" }}>
                <p style={{ textAlign:"center", fontSize:13, color:txtSub, margin:0 }}>
                  Don't have an account?{" "}
                  <span className="auth-link" style={{ color:linkClr }} onClick={() => navigate("/register")}>Create one</span>
                </p>
                <button onClick={() => openTicket("")}
                  style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:txtSub, fontFamily:"inherit", display:"inline-flex", alignItems:"center", gap:5, transition:"color 0.15s", padding:0 }}
                  onMouseEnter={e => e.currentTarget.style.color=linkClr}
                  onMouseLeave={e => e.currentTarget.style.color=txtSub}>
                  <MessageSquare size={12}/> Having trouble? Raise a support ticket
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default Login;
