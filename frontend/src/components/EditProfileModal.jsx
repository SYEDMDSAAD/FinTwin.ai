// ─── SHARED MODAL CSS ────────────────────────────────────────────────────────
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

// ─── EditProfileModal.jsx ─────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { User, Mail, X } from "lucide-react";
import API from "../services/api";
import toast from "react-hot-toast";

export function EditProfileModal({ open, onClose, profile, onSuccess }) {
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    if (profile) setFullName(profile.fullName || "");
  }, [profile]);

  const handleUpdate = async () => {
    if (!fullName.trim()) { toast.error("Please enter your name."); return; }
    try {
      await API.put("/profile/update", { fullName });
      localStorage.setItem("fullName", fullName);
      toast.success("Profile updated!");
      onSuccess();
      onClose();
    } catch { toast.error("Failed to update profile."); }
  };

  if (!open) return null;
  const initial = fullName?.charAt(0).toUpperCase() || "U";

  return (
    <>
      <style>{MODAL_CSS}</style>
      <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal-box modal-in">
          {/* Top accent */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg,transparent,#a78bfa,#22d3ee,transparent)" }} />

          {/* Banner */}
          <div className="modal-banner" style={{ background: "linear-gradient(135deg,#7c3aed,#a78bfa,#22d3ee)" }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.15)" }} />
          </div>

          {/* Close */}
          <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, width: 32, height: 32, borderRadius: 9, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(255,255,255,0.7)" }}>
            <X size={15} />
          </button>

          {/* Avatar */}
          <div style={{ position: "absolute", top: 56, left: 28 }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", border: "3px solid #0a0c12", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, color: "#fff", boxShadow: "0 0 30px rgba(167,139,250,0.4)" }}>
              {initial}
            </div>
          </div>

          <div className="modal-content">
            <div style={{ marginTop: 44, marginBottom: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(167,139,250,0.6)", letterSpacing: "0.1em", marginBottom: 4 }}>ACCOUNT</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 0 4px", letterSpacing: "-0.02em" }}>Edit Profile</h2>
              <p style={{ fontSize: 12, color: "rgba(148,163,184,0.5)", margin: 0 }}>Personalize your FinTwin account</p>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>FULL NAME</label>
              <div className="modal-input-wrap">
                <User size={14} color="rgba(167,139,250,0.6)" />
                <input className="modal-input" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleUpdate()} />
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>EMAIL ADDRESS</label>
              <div className="modal-input-wrap" style={{ opacity: 0.6 }}>
                <Mail size={14} color="rgba(34,211,238,0.6)" />
                <input className="modal-input" type="email" disabled value={profile?.email || ""} />
              </div>
              <p style={{ fontSize: 11, color: "rgba(34,211,238,0.5)", margin: "6px 0 0" }}>🔒 Email is locked for security reasons</p>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="modal-btn" onClick={handleUpdate} style={{ background: "linear-gradient(135deg,#a78bfa,#7c3aed)", color: "#fff" }}>Save Changes</button>
              <button className="modal-btn modal-btn-cancel" onClick={onClose}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default EditProfileModal;