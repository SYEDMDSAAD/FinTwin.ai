import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { identityApi } from "../services/api";
import { useTheme } from "../context/ThemeContext";
import { Lock, Eye, EyeOff } from "lucide-react";

const CSS = `
  .auth-page * { box-sizing: border-box; }
  .auth-page { font-family:inherit; }
  .auth-input-wrap { display:flex; align-items:center; gap:12px; border-radius:13px; padding:0 16px; transition:all 0.2s; }
  .auth-input-wrap:focus-within { box-shadow:0 0 0 3px var(--accent-soft) !important; }
  .auth-input { width:100%; background:transparent; padding:14px 0; font-size:14px; outline:none; font-family:inherit; }
  .auth-btn { width:100%; padding:14px; border-radius:13px; border:none; font-size:14px; font-weight:700; cursor:pointer; transition:all 0.22s; font-family:inherit;  }
  .auth-btn:hover:not(:disabled) { opacity:0.92; transform:translateY(-1px); box-shadow:0 8px 28px var(--accent-soft); }
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
    if (/[!@#$%^&*()_+\-=[\]{}|;':",./<>?]/.test(newPassword)) s++;
    return s;
  })();
  const strengthColor = ["var(--border-card)","var(--bad)","var(--warn)","var(--good)","var(--good)"][pwStrength];

  const pageBg   = isDark ? "var(--bg-base)" : "linear-gradient(135deg, #eef2fa 0%, #e3eaf7 48%, #ede8fb 100%)";
  const cardBg   = isDark ? "var(--bg-input)" : "rgba(255,255,255,0.88)";
  const cardBdr  = isDark ? "1px solid var(--border-card)" : "1px solid rgba(15,23,42,0.08)";
  const cardShd  = isDark ? "0 40px 100px rgba(0,0,0,0.5)" : "0 24px 64px rgba(15,23,42,0.13)";
  const accentH  = isDark ? 1 : 3;
  const txt      = isDark ? "#fff" : "#0f172a";
  const txtSub   = isDark ? "var(--text-dim)" : "var(--text-dim)";
  const txtLabel = isDark ? "var(--text-dim)" : "var(--text-dim)";
  const inputBg  = isDark ? "var(--bg-input)" : "rgba(15,23,42,0.04)";
  const inputBdr = isDark ? "1px solid var(--border-card)" : "1px solid rgba(15,23,42,0.10)";
  const inputClr = isDark ? "var(--text-primary)" : "#0f172a";
  const barTrack = isDark ? "var(--border-card)" : "rgba(15,23,42,0.08)";
  const reqMet   = isDark ? "var(--good)" : "#059669";
  const reqUnmet = isDark ? "var(--text-dim)" : "var(--text-dim)";
  const linkClr  = isDark ? "var(--accent)" : "var(--accent-strong)";

  const handleSubmit = async () => {
    if (!token) { toast.error("Invalid reset link"); return; }
    if (pwStrength < 4) { toast.error("Password must have 8+ chars, uppercase, digit, and special character."); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match"); return; }
    try {
      setLoading(true);
      await identityApi.post("/auth/reset-password", { token, newPassword });
      toast.success("Password updated! You can now sign in.");
      navigate("/login");
    } catch (e) {
      toast.error(e.response?.data || "Reset link is invalid or expired");
    } finally { setLoading(false); }
  };

  if (!token) {
    return (
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:pageBg }}>
        <div style={{ textAlign:"center", color:txt }}>
          <div style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>Invalid reset link</div>
          <div style={{ fontSize:13, color:txtSub, marginBottom:20 }}>This link is missing a token. Please request a new one.</div>
          <button onClick={() => navigate("/login")} style={{ padding:"10px 20px", borderRadius:12, border:"none", background:"var(--accent-strong)", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
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
            <div style={{ position:"fixed", top:"-10%", right:"5%", width:450, height:450, borderRadius:"50%", background:"radial-gradient(circle,var(--accent-soft) 0%,transparent 70%)", pointerEvents:"none" }}/>
            <div style={{ position:"fixed", bottom:"-10%", left:"0%", width:380, height:380, borderRadius:"50%", background:"radial-gradient(circle,var(--info-soft) 0%,transparent 70%)", pointerEvents:"none" }}/>
          </>
        )}

        <div className="auth-fade" style={{ width:"100%", maxWidth:420, background:cardBg, border:cardBdr, borderRadius:24, padding:"40px 36px", backdropFilter:"blur(24px)", boxShadow:cardShd, position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:0, left:0, right:0, height:accentH, background:"linear-gradient(90deg, var(--accent), var(--accent-strong) 40%, var(--info))" }}/>

          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:32 }}>
            <div style={{ width:38, height:38, borderRadius:11, background:"var(--accent-strong)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, fontWeight: 650, color:"#fff", flexShrink:0 }}>F</div>
            <div>
              <div style={{ fontSize:14, fontWeight: 650, color:txt, letterSpacing:"-0.02em" }}>FinTwin AI</div>
              <div style={{ fontSize: 12, color:txtSub }}>Financial os</div>
            </div>
          </div>

          <div style={{ marginBottom:28 }}>
            <h1 style={{ fontSize:24, fontWeight: 650, color:txt, margin:"0 0 6px", letterSpacing:"-0.03em" }}>Set new password</h1>
            <p style={{ fontSize:13, color:txtSub, margin:0 }}>Choose a strong password for your account.</p>
          </div>

          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize: 12, fontWeight:700, color:txtLabel, display:"block", marginBottom:7 }}>New password</label>
            <div className="auth-input-wrap" style={{ background:inputBg, border:inputBdr }}>
              <Lock size={15} color="var(--text-dim)"/>
              <input className="auth-input" style={{ color:inputClr }} type={showPw ? "text" : "password"} placeholder="Min 8 characters" value={newPassword} onChange={e => setNewPassword(e.target.value)}/>
              <button onClick={() => setShowPw(!showPw)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text-dim)", padding:0, display:"flex" }}>
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
                    [/[!@#$%^&*()_+\-=[\]{}|;':",./<>?]/, "special character"],
                  ].map(([re, label]) => (
                    <span key={label} style={{ fontSize: 12, color: re.test(newPassword) ? reqMet : reqUnmet }}>
                      {re.test(newPassword) ? "✓" : "○"} {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ marginBottom:28 }}>
            <label style={{ fontSize: 12, fontWeight:700, color:txtLabel, display:"block", marginBottom:7 }}>Confirm password</label>
            <div className="auth-input-wrap" style={{ background:inputBg, border:inputBdr }}>
              <Lock size={15} color="var(--text-dim)"/>
              <input className="auth-input" style={{ color:inputClr }} type={showPw ? "text" : "password"} placeholder="Repeat password" value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}/>
            </div>
            {confirmPassword.length > 0 && newPassword !== confirmPassword && (
              <div style={{ fontSize: 12, color:"var(--bad)", marginTop:5 }}>Passwords do not match</div>
            )}
          </div>

          <button className="auth-btn" onClick={handleSubmit}
            disabled={loading || pwStrength < 4 || newPassword !== confirmPassword}
            style={{ background:"var(--accent-strong)", color:"#fff", marginBottom:16 }}>
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
