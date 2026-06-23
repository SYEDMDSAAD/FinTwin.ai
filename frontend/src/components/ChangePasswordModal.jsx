const MODAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap');
  .modal-overlay { position:fixed; inset:0; z-index:50; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.75); backdrop-filter:blur(10px); padding:20px; font-family:'DM Sans',system-ui,sans-serif; }
  .modal-box { position:relative; width:100%; max-width:480px; background:rgba(10,12,18,0.97); border:1px solid rgba(255,255,255,0.08); border-radius:22px; overflow:hidden; box-shadow:0 40px 100px rgba(0,0,0,0.7); }
  .modal-banner { height:100px; position:relative; }
  .modal-content { padding:0 28px 28px; }
  .modal-input-wrap { display:flex; align-items:center; gap:12px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.09); border-radius:12px; padding:0 14px; transition:border-color 0.2s; }
  .modal-input-wrap:focus-within { border-color:rgba(167,139,250,0.45); }
  .modal-input { width:100%; background:transparent; padding:13px 0; color:#e2e8f0; font-size:13px; outline:none; font-family:inherit; }
  .modal-input::placeholder { color:rgba(100,116,139,0.45); }
  .modal-input:disabled { color:rgba(100,116,139,0.4); cursor:not-allowed; }
  .modal-btn { flex:1; padding:13px; border-radius:12px; border:none; font-size:13px; font-weight:700; cursor:pointer; transition:all 0.2s; font-family:inherit; letter-spacing:0.02em; }
  .modal-btn:hover { opacity:0.9; transform:translateY(-1px); }
  .modal-btn-cancel { background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.09) !important; color:rgba(148,163,184,0.7); border:none; }
  .modal-btn-cancel:hover { background:rgba(255,255,255,0.08); }
  @keyframes modalIn { from{opacity:0;transform:scale(0.95) translateY(12px)} to{opacity:1;transform:scale(1) translateY(0)} }
  .modal-in { animation: modalIn 0.22s ease both; }
`;

// ─── ChangePasswordModal.jsx ──────────────────────────────────────────────────
import { Shield, Lock, Eye, EyeOff } from "lucide-react";

import { useState, useEffect } from "react";

import { User, Mail, X } from "lucide-react";

import API from "../services/api";
import toast from "react-hot-toast";

export function ChangePasswordModal({ open, onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const handleSubmit = async () => {
    if (!currentPassword || !newPassword) { toast.error("Please fill all fields."); return; }
    if (newPassword.length < 6) { toast.error("Password must be at least 6 characters."); return; }
    try {
      await API.put("/profile/change-password", { currentPassword, newPassword });
      toast.success("Password updated!");
      setCurrentPassword(""); setNewPassword("");
      onClose();
    } catch { toast.error("Current password is incorrect."); }
  };

  if (!open) return null;

  const strength = newPassword.length >= 10 ? 4 : newPassword.length >= 8 ? 3 : newPassword.length >= 6 ? 2 : newPassword.length > 0 ? 1 : 0;
  const strengthColor = strength >= 4 ? "#4ade80" : strength >= 3 ? "#22d3ee" : strength >= 2 ? "#fbbf24" : "#f87171";

  return (
    <>
      <style>{MODAL_CSS}</style>
      <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal-box modal-in">
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg,transparent,#22d3ee,#a78bfa,transparent)" }} />

          <div className="modal-banner" style={{ background: "linear-gradient(135deg,#0891b2,#22d3ee,#7c3aed)" }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.15)" }} />
          </div>

          <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, width: 32, height: 32, borderRadius: 9, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(255,255,255,0.7)" }}>
            <X size={15} />
          </button>

          <div style={{ position: "absolute", top: 56, left: 28 }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg,#0891b2,#7c3aed)", border: "3px solid #0a0c12", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 30px rgba(34,211,238,0.4)" }}>
              <Shield size={28} color="#fff" />
            </div>
          </div>

          <div className="modal-content">
            <div style={{ marginTop: 44, marginBottom: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(34,211,238,0.6)", letterSpacing: "0.1em", marginBottom: 4 }}>SECURITY</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 0 4px", letterSpacing: "-0.02em" }}>Change Password</h2>
              <p style={{ fontSize: 12, color: "rgba(148,163,184,0.5)", margin: 0 }}>Keep your FinTwin account secure</p>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>CURRENT PASSWORD</label>
              <div className="modal-input-wrap">
                <Lock size={14} color="rgba(34,211,238,0.6)" />
                <input className="modal-input" type={showCurrent ? "text" : "password"} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" />
                <button onClick={() => setShowCurrent(!showCurrent)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(148,163,184,0.5)", padding: 0, display: "flex" }}>
                  {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>NEW PASSWORD</label>
              <div className="modal-input-wrap">
                <Lock size={14} color="rgba(167,139,250,0.6)" />
                <input className="modal-input" type={showNew ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 6 characters" />
                <button onClick={() => setShowNew(!showNew)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(148,163,184,0.5)", padding: 0, display: "flex" }}>
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {newPassword.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: strength >= i ? strengthColor : "rgba(255,255,255,0.07)", transition: "background 0.3s" }} />
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="modal-btn" onClick={handleSubmit} style={{ background: "linear-gradient(135deg,#22d3ee,#7c3aed)", color: "#fff" }}>Update Password</button>
              <button className="modal-btn modal-btn-cancel" onClick={onClose}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default ChangePasswordModal;