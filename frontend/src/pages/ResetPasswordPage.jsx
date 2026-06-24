import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import API from "../services/api";
import { useTheme } from "../context/ThemeContext";
import { Lock, Eye, EyeOff } from "lucide-react";

const CSS = `
  .auth-page * { box-sizing: border-box; }
  .auth-page { font-family: 'DM Sans', system-ui, sans-serif; }
  .auth-input-wrap { display:flex; align-items:center; gap:12px; border-radius:13px; padding:0 16px; transition:all 0.2s; }
  .auth-input-wrap:focus-within { box-shadow:0 0 0 3px rgba(124,58,237,0.10) !important; }
  .auth-input { width:100%; background:transparent; padding:14px 0; font-size:14px; outline:none; font-family:inherit; }
  .auth-btn { width:100%; padding:14px; border-radius:13px; border:none; font-size:14px; font-weight:700; cursor:pointer; transition:all 0.22s; font-family:inherit; letter-spacing:0.02em; }
  .auth-btn:hover:not(:disabled) { opacity:0.92; transform:translateY(-1px); box-shadow:0 8px 28px rgba(124,58,237,0.30); }
  .auth-btn:disabled { opacity:0.5; cursor:not-allowed; }
  @keyframes authFade { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
  .auth-fade { animation: authFade 0.45s cubic-bezier(0.22,1,0.36,1) both; }
`;

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isDark } = useTheme();

  const token = searchParams.get("token") || "";

  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw,          setShowPw]          = useState(false);
  const [loading,         setLoading]         = useState(false);

  const pwStrength = (() => {
    let s = 0;
    if (newPassword.length >= 8) s++;
    if (/[A-Z]/.test(newPassword)) s++;
    if (/[0-9]/.test(newPassword)) s++;
    if (/[!@#$%^&*()_+\-=\[\]{}|;':",./<>?]/.test(newPassword)) s++;
    return s;
  })();
  const strengthColor = ["rgba(255,255,255,0.08)","#f87171","#fbbf24","#34d399","#34d399"][pwStrength];

  const pageBg   = isDark ? "#080a0f" : "linear-gradient(135deg, #eef2fa 0%, #e3eaf7 48%, #ede8fb 100%)";
  const cardBg   = isDark ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.88)";
  const cardBdr  = isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)";
  const cardShd  = isDark ? "0 40px 100px rgba(0,0,0,0.5)" : "0 24px 64px rgba(15,23,42,0.13)";
  const accentH  = isDark ? 1 : 3;
  const txt      = isDark ? "#fff" : "#0f172a";
  const txtSub   = isDark ? "rgba(148,163,184,0.5)" : "rgba(71,85,105,0.75)";
  const txtLabel = isDark ? "rgba(148,163,184,0.6)" : "rgba(71,85,105,0.70)";
  const inputBg  = isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.04)";
  const inputBdr = isDark ? "1px solid rgba(255,255,255,0.09)" : "1px solid rgba(15,23,42,0.10)";
  const inputClr = isDark ? "#e2e8f0" : "#0f172a";
  const barTrack = isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)";
  const reqMet   = isDark ? "#34d399" : "#059669";
  const reqUnmet = isDark ? "rgba(148,163,184,0.4)" : "rgba(100,116,139,0.5)";
  const linkClr  = isDark ? "#a78bfa" : "#7c3aed";

  const handleSubmit = async () => {
    if (!token) { toast.error("Invalid reset link"); return; }
    if (pwStrength < 4) { toast.error("Password must have 8+ chars, uppercase, digit, and special character."); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match"); return; }
    try {
      setLoading(true);
      await API.post("/auth/reset-password", { token, newPassword });
      toast.success("Password updated! You can now sign in.");
      navigate("/login");
    } catch (e) {
      toast.error(e.response?.data || "Reset link is invalid or expired");
    } finally { setLoading(false); }
  };

  if (!token) {
    return (
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:pageBg, fontFamily:"'DM Sans', system-ui, sans-serif" }}>
        <div style={{ textAlign:"center", color:txt }}>
          <div style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>Invalid reset link</div>
          <div style={{ fontSize:13, color:txtSub, marginBottom:20 }}>This link is missing a token. Please request a new one.</div>
          <button onClick={() => navigate("/login")} style={{ padding:"10px 20px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#a78bfa,#7c3aed)", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="auth-page" style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:pageBg, position:"relative", overflow:"hidden", padding:20 }}>
        {isDark && (
          <>
            <div style={{ position:"fixed", top:"-10%", right:"5%", width:450, height:450, borderRadius:"50%", background:"radial-gradient(circle,rgba(167,139,250,0.1) 0%,transparent 70%)", pointerEvents:"none" }}/>
            <div style={{ position:"fixed", bottom:"-10%", left:"0%", width:380, height:380, borderRadius:"50%", background:"radial-gradient(circle,rgba(34,211,238,0.07) 0%,transparent 70%)", pointerEvents:"none" }}/>
          </>
        )}

        <div className="auth-fade" style={{ width:"100%", maxWidth:420, background:cardBg, border:cardBdr, borderRadius:24, padding:"40px 36px", backdropFilter:"blur(24px)", boxShadow:cardShd, position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:0, left:0, right:0, height:accentH, background:"linear-gradient(90deg, #a78bfa, #7c3aed 40%, #22d3ee)" }}/>

          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:32 }}>
            <div style={{ width:38, height:38, borderRadius:11, background:"linear-gradient(135deg,#a78bfa,#22d3ee)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, fontWeight:800, color:"#fff", flexShrink:0 }}>F</div>
            <div>
              <div style={{ fontSize:14, fontWeight:800, color:txt, letterSpacing:"-0.02em" }}>FinTwin AI</div>
              <div style={{ fontSize:10, color:txtSub, letterSpacing:"0.06em" }}>FINANCIAL OS</div>
            </div>
          </div>

          <div style={{ marginBottom:28 }}>
            <h1 style={{ fontSize:24, fontWeight:800, color:txt, margin:"0 0 6px", letterSpacing:"-0.03em" }}>Set new password</h1>
            <p style={{ fontSize:13, color:txtSub, margin:0 }}>Choose a strong password for your account.</p>
          </div>

          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, fontWeight:700, color:txtLabel, letterSpacing:"0.08em", display:"block", marginBottom:7 }}>NEW PASSWORD</label>
            <div className="auth-input-wrap" style={{ background:inputBg, border:inputBdr }}>
              <Lock size={15} color="rgba(148,163,184,0.5)"/>
              <input className="auth-input" style={{ color:inputClr }} type={showPw ? "text" : "password"} placeholder="Min 8 characters" value={newPassword} onChange={e => setNewPassword(e.target.value)}/>
              <button onClick={() => setShowPw(!showPw)} style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(148,163,184,0.5)", padding:0, display:"flex" }}>
                {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
            {newPassword.length > 0 && (
              <div style={{ marginTop:8, marginBottom:4 }}>
                <div style={{ display:"flex", gap:4, marginBottom:6 }}>
                  {[1,2,3,4].map(i => (
                    <div key={i} style={{ flex:1, height:3, borderRadius:2, background:pwStrength >= i ? strengthColor : barTrack, transition:"background 0.3s" }}/>
                  ))}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                  {[
                    [/^.{8,}$/, "8+ characters"],
                    [/[A-Z]/, "uppercase letter"],
                    [/[0-9]/, "digit"],
                    [/[!@#$%^&*()_+\-=\[\]{}|;':",./<>?]/, "special character"],
                  ].map(([re, label]) => (
                    <span key={label} style={{ fontSize:10, color: re.test(newPassword) ? reqMet : reqUnmet }}>
                      {re.test(newPassword) ? "✓" : "○"} {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ marginBottom:28 }}>
            <label style={{ fontSize:11, fontWeight:700, color:txtLabel, letterSpacing:"0.08em", display:"block", marginBottom:7 }}>CONFIRM PASSWORD</label>
            <div className="auth-input-wrap" style={{ background:inputBg, border:inputBdr }}>
              <Lock size={15} color="rgba(148,163,184,0.5)"/>
              <input className="auth-input" style={{ color:inputClr }} type={showPw ? "text" : "password"} placeholder="Repeat password" value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}/>
            </div>
            {confirmPassword.length > 0 && newPassword !== confirmPassword && (
              <div style={{ fontSize:11, color:"#f87171", marginTop:5 }}>Passwords do not match</div>
            )}
          </div>

          <button className="auth-btn" onClick={handleSubmit}
            disabled={loading || pwStrength < 4 || newPassword !== confirmPassword}
            style={{ background:"linear-gradient(135deg,#a78bfa,#7c3aed)", color:"#fff", marginBottom:16 }}>
            {loading ? "Updating…" : "Update Password →"}
          </button>

          <p style={{ textAlign:"center", fontSize:12, color:txtSub, margin:0 }}>
            <span style={{ cursor:"pointer", color:linkClr, fontWeight:600 }} onClick={() => navigate("/login")}>Back to sign in</span>
          </p>
        </div>
      </div>
    </>
  );
}

export default ResetPasswordPage;
