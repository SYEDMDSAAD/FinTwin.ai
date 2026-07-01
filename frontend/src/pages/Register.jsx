import { useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { identityApi } from "../services/api";
import { useTheme } from "../context/ThemeContext";
import { Mail, Lock, User, Eye, EyeOff, CheckCircle, ArrowLeft } from "lucide-react";

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

const PERKS = [
  "AI-powered financial score",
  "Spending forecasts & insights",
  "Smart budget alerts",
];

function Register() {
  const navigate   = useNavigate();
  const location   = useLocation();
  const { isDark } = useTheme();

  // When redirected here from Login because the email isn't verified yet,
  // jump straight to the OTP step with the email prefilled.
  const verifyEmail = location.state?.verifyEmail;

  const [step,     setStep]     = useState(verifyEmail ? "otp" : "register"); // "register" | "otp"
  const [fullName, setFullName] = useState("");
  const [email,    setEmail]    = useState(verifyEmail || "");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [consent,  setConsent]  = useState(false);
  const [loading,  setLoading]  = useState(false);

  // OTP step state
  const [otpCode,    setOtpCode]    = useState(["","","","","",""]);
  const [otpLoading, setOtpLoading] = useState(false);
  const [resending,  setResending]  = useState(false);
  const otpRefs = useRef([]);

  const pwStrength = (() => {
    let s = 0;
    if (password.length >= 8) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[!@#$%^&*()_+\-=[\]{}|;':",./<>?]/.test(password)) s++;
    return s;
  })();
  const strengthColor = ["rgba(255,255,255,0.08)","#f87171","#fbbf24","#34d399","#34d399"][pwStrength];

  const register = async () => {
    if (!fullName.trim() || !email.trim() || !password) { toast.error("Please fill all fields."); return; }
    if (pwStrength < 4) { toast.error("Password must have 8+ chars, uppercase, digit, and special character."); return; }
    if (!consent) { toast.error("You must accept the Privacy Policy to register."); return; }
    try {
      setLoading(true);
      const res = await identityApi.post("/auth/register", { fullName, email, password, consentGiven: true });
      if (res.data?.devOtp) {
        toast.success(`Dev mode: your OTP is ${res.data.devOtp}`, { duration: 15000 });
      } else {
        toast.success("Account created! Check your email for a verification code.");
      }
      setStep("otp");
    } catch (e) {
      const msg = e.response?.data?.error || (typeof e.response?.data === "string" ? e.response.data : null) || "Registration failed";
      toast.error(msg);
    } finally { setLoading(false); }
  };

  const handleOtpChange = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otpCode]; next[i] = val; setOtpCode(next);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
  };
  const handleOtpKeyDown = (i, e) => {
    if (e.key === "Backspace" && !otpCode[i] && i > 0) otpRefs.current[i - 1]?.focus();
  };
  const handleOtpPaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g,"").slice(0,6);
    if (!pasted) return; e.preventDefault();
    const next = [...otpCode]; pasted.split("").forEach((ch,i) => { next[i] = ch; }); setOtpCode(next);
    otpRefs.current[Math.min(pasted.length,5)]?.focus();
  };

  const verifyOtp = async () => {
    const otp = otpCode.join("");
    if (otp.length < 6) { toast.error("Enter the 6-digit code"); return; }
    try {
      setOtpLoading(true);
      await identityApi.post("/auth/verify-email", { email: email.toLowerCase().trim(), otp });
      toast.success("Email verified! You can now sign in.");
      navigate("/login", { replace: true });
    } catch (e) { toast.error(e.response?.data || "Invalid or expired code"); }
    finally { setOtpLoading(false); }
  };

  const resendOtp = async () => {
    try {
      setResending(true);
      const res = await identityApi.post("/auth/resend-verification", { email: email.toLowerCase().trim() });
      if (res.data?.devOtp) {
        toast.success(`Dev mode: new OTP is ${res.data.devOtp}`, { duration: 15000 });
      } else {
        toast.success("New code sent!");
      }
      setOtpCode(["","","","","",""]);
    } catch { toast.error("Failed to resend"); }
    finally { setResending(false); }
  };

  /* ── theme-derived tokens ─────────────────────────── */
  const pageBg   = isDark ? "#080a0f" : "linear-gradient(135deg, #eef2fa 0%, #e3eaf7 48%, #ede8fb 100%)";
  const cardBg   = isDark ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.88)";
  const cardBdr  = isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)";
  const cardShd  = isDark ? "0 40px 100px rgba(0,0,0,0.5)" : "0 24px 64px rgba(15,23,42,0.13), 0 4px 20px rgba(15,23,42,0.06)";
  const accentH  = isDark ? 1 : 3;
  const txt      = isDark ? "#fff"                      : "#0f172a";
  const txtSub   = isDark ? "rgba(148,163,184,0.5)"     : "rgba(71,85,105,0.75)";
  const txtLabel = isDark ? "rgba(148,163,184,0.6)"     : "rgba(71,85,105,0.70)";
  const inputBg  = isDark ? "rgba(255,255,255,0.04)"    : "rgba(15,23,42,0.04)";
  const inputBdr = isDark ? "1px solid rgba(255,255,255,0.09)" : "1px solid rgba(15,23,42,0.10)";
  const inputClr = isDark ? "#e2e8f0"                   : "#0f172a";
  const perksBg  = isDark ? "rgba(167,139,250,0.06)"    : "rgba(109,40,217,0.05)";
  const perksBdr = isDark ? "rgba(167,139,250,0.14)"    : "rgba(109,40,217,0.14)";
  const linkClr  = isDark ? "#a78bfa"                   : "#7c3aed";
  const barTrack = isDark ? "rgba(255,255,255,0.08)"    : "rgba(15,23,42,0.08)";
  const reqMet   = isDark ? "#34d399"                   : "#059669";
  const reqUnmet = isDark ? "rgba(148,163,184,0.4)"     : "rgba(100,116,139,0.5)";
  const otpBdr   = isDark ? "rgba(255,255,255,0.09)"    : "rgba(15,23,42,0.10)";

  return (
    <>
      <style>{CSS}</style>
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
            <div style={{ position:"fixed", top:"-10%", right:"5%", width:450, height:450, borderRadius:"50%", background:"radial-gradient(circle,rgba(167,139,250,0.1) 0%,transparent 70%)", pointerEvents:"none" }}/>
            <div style={{ position:"fixed", bottom:"-10%", left:"0%", width:380, height:380, borderRadius:"50%", background:"radial-gradient(circle,rgba(34,211,238,0.07) 0%,transparent 70%)", pointerEvents:"none" }}/>
          </>
        )}

        {/* ── Card ── */}
        <div className="auth-fade" style={{ width:"100%", maxWidth:460, background:cardBg, border:cardBdr, borderRadius:24, padding:"40px 36px", backdropFilter:"blur(24px)", boxShadow:cardShd, position:"relative", overflow:"hidden" }}>

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

          {/* ── OTP Verification Step ── */}
          {step === "otp" ? (
            <div key="otp">
              <button onClick={() => setStep("register")}
                style={{ background:"none", border:"none", color:linkClr, fontSize:13, cursor:"pointer", fontFamily:"inherit", padding:0, display:"flex", alignItems:"center", gap:6, marginBottom:24 }}>
                <ArrowLeft size={14}/> Back
              </button>
              <div style={{ marginBottom:24 }}>
                <h1 style={{ fontSize:22, fontWeight:800, color:txt, margin:"0 0 8px", letterSpacing:"-0.03em" }}>Verify your email</h1>
                <p style={{ fontSize:13, color:txtSub, margin:0, lineHeight:1.6 }}>
                  We sent a 6-digit code to <strong style={{ color:txt }}>{email}</strong>. It expires in 10 minutes.
                </p>
              </div>
              <div style={{ display:"flex", gap:10, justifyContent:"center", marginBottom:24 }}>
                {otpCode.map((digit, i) => (
                  <input key={i} ref={el => (otpRefs.current[i] = el)} className="otp-box"
                    style={{ background:inputBg, border:`1px solid ${otpBdr}`, color:inputClr }}
                    type="text" inputMode="numeric" maxLength={1} value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    onPaste={i === 0 ? handleOtpPaste : undefined}
                    autoFocus={i === 0}/>
                ))}
              </div>
              <button className="auth-btn" onClick={verifyOtp}
                disabled={otpLoading || otpCode.join("").length < 6}
                style={{ background:"linear-gradient(135deg,#a78bfa,#7c3aed)", color:"#fff", marginBottom:16 }}>
                {otpLoading ? "Verifying…" : "Verify Email →"}
              </button>
              <p style={{ textAlign:"center", fontSize:12, color:txtSub, margin:0 }}>
                Didn't receive it?{" "}
                <span className="auth-link" style={{ color:linkClr, opacity: resending ? 0.5 : 1 }}
                  onClick={() => !resending && resendOtp()}>
                  {resending ? "Sending…" : "Resend code"}
                </span>
              </p>
            </div>

          ) : (
          /* ── Registration Step ── */
          <div key="register">
          <div style={{ marginBottom:24 }}>
            <h1 style={{ fontSize:26, fontWeight:800, color:txt, margin:"0 0 6px", letterSpacing:"-0.03em" }}>Create account</h1>
            <p style={{ fontSize:13, color:txtSub, margin:0 }}>Your AI financial twin awaits</p>
          </div>

          {/* Perks */}
          <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:24, background:perksBg, border:`1px solid ${perksBdr}`, borderRadius:12, padding:"12px 14px" }}>
            {PERKS.map((p) => (
              <div key={p} style={{ display:"flex", alignItems:"center", gap:8 }}>
                <CheckCircle size={13} color="#4ade80"/>
                <span style={{ fontSize:12, color:txtSub }}>{p}</span>
              </div>
            ))}
          </div>

          {/* Full Name */}
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, fontWeight:700, color:txtLabel, letterSpacing:"0.08em", display:"block", marginBottom:7 }}>FULL NAME</label>
            <div className="auth-input-wrap" style={{ background:inputBg, border:inputBdr }}>
              <User size={15} color="rgba(148,163,184,0.5)"/>
              <input className="auth-input" style={{ color:inputClr }} type="text" placeholder="John Doe" value={fullName} onChange={e => setFullName(e.target.value)}/>
            </div>
          </div>

          {/* Email */}
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, fontWeight:700, color:txtLabel, letterSpacing:"0.08em", display:"block", marginBottom:7 }}>EMAIL ADDRESS</label>
            <div className="auth-input-wrap" style={{ background:inputBg, border:inputBdr }}>
              <Mail size={15} color="rgba(148,163,184,0.5)"/>
              <input className="auth-input" style={{ color:inputClr }} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)}/>
            </div>
          </div>

          {/* Password */}
          <div style={{ marginBottom:24 }}>
            <label style={{ fontSize:11, fontWeight:700, color:txtLabel, letterSpacing:"0.08em", display:"block", marginBottom:7 }}>PASSWORD</label>
            <div className="auth-input-wrap" style={{ background:inputBg, border:inputBdr }}>
              <Lock size={15} color="rgba(148,163,184,0.5)"/>
              <input className="auth-input" style={{ color:inputClr }} type={showPw ? "text" : "password"} placeholder="Min 8 characters" value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && register()}/>
              <button onClick={() => setShowPw(!showPw)} style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(148,163,184,0.5)", padding:0, display:"flex", alignItems:"center" }}>
                {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
            {password.length > 0 && (
              <div style={{ marginTop:8 }}>
                <div style={{ display:"flex", gap:4, marginBottom:6 }}>
                  {[1,2,3,4].map(i => (
                    <div key={i} style={{ flex:1, height:3, borderRadius:2, background:pwStrength >= i ? strengthColor : barTrack, transition:"background 0.3s" }}/>
                  ))}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                  {[
                    [/^.{8,}$/, "8+ characters"],
                    [/[A-Z]/,   "uppercase letter"],
                    [/[0-9]/,   "digit"],
                    [/[!@#$%^&*()_+\-=[\]{}|;':",./<>?]/, "special character"],
                  ].map(([re, label]) => (
                    <span key={label} style={{ fontSize:10, color: re.test(password) ? reqMet : reqUnmet }}>
                      {re.test(password) ? "✓" : "○"} {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Consent — GDPR */}
          <div style={{ marginBottom:20, display:"flex", alignItems:"flex-start", gap:10 }}>
            <input type="checkbox" id="consent" checked={consent} onChange={e => setConsent(e.target.checked)}
              style={{ marginTop:2, accentColor:"#7c3aed", width:15, height:15, flexShrink:0, cursor:"pointer" }}/>
            <label htmlFor="consent" style={{ fontSize:12, color:txtSub, lineHeight:1.5, cursor:"pointer" }}>
              I agree to the{" "}
              <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color:linkClr, textDecoration:"none" }}>Privacy Policy</a>
              {" "}and consent to FinTwin AI collecting and processing my financial data to provide the service.
            </label>
          </div>

          <button className="auth-btn" onClick={register} disabled={loading || !consent}
            style={{ background:"linear-gradient(135deg,#a78bfa,#7c3aed)", color:"#fff", marginBottom:20 }}>
            {loading ? "Creating account…" : "Create Account →"}
          </button>

          <p style={{ textAlign:"center", fontSize:13, color:txtSub, margin:0 }}>
            Already have an account?{" "}
            <span className="auth-link" style={{ color:linkClr }} onClick={() => navigate("/login")}>Sign in</span>
          </p>
          </div>
          )}
        </div>
      </div>
    </>
  );
}

export default Register;
