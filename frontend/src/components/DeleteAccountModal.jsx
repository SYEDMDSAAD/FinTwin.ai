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

// ─── DeleteAccountModal.jsx ───────────────────────────────────────────────────
import { Trash2, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { User, Mail, X } from "lucide-react";
import API from "../services/api";
import toast from "react-hot-toast";

export function DeleteAccountModal({ open, onClose }) {
  const [confirmed, setConfirmed] = useState(false);

  const handleDelete = async () => {
    try {
      await API.delete("/profile/delete");
      toast.success("Account deleted successfully.");
      localStorage.removeItem("token");
      window.location.href = "/login";
    } catch { toast.error("Failed to delete account."); }
  };

  if (!open) return null;

  return (
    <>
      <style>{MODAL_CSS}</style>
      <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal-box modal-in" style={{ boxShadow: "0 40px 100px rgba(248,113,113,0.2), 0 0 0 1px rgba(248,113,113,0.1)" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg,transparent,#f87171,#fbbf24,transparent)" }} />

          <div className="modal-banner" style={{ background: "linear-gradient(135deg,#7f1d1d,#dc2626,#ef4444)" }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.2)" }} />
          </div>

          <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, width: 32, height: 32, borderRadius: 9, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(255,255,255,0.7)" }}>
            <X size={15} />
          </button>

          <div style={{ position: "absolute", top: 56, left: 28 }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg,#dc2626,#f87171)", border: "3px solid #0a0c12", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 30px rgba(248,113,113,0.5)" }}>
              <Trash2 size={26} color="#fff" />
            </div>
          </div>

          <div className="modal-content">
            <div style={{ marginTop: 44, marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(248,113,113,0.7)", letterSpacing: "0.1em", marginBottom: 4 }}>DANGER ZONE</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 0 4px", letterSpacing: "-0.02em" }}>Delete Account</h2>
              <p style={{ fontSize: 12, color: "rgba(148,163,184,0.5)", margin: 0 }}>This action cannot be undone.</p>
            </div>

            {/* Warning box */}
            <div style={{ background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.2)", borderLeft: "3px solid #f87171", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <AlertTriangle size={15} color="#f87171" style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#f87171", margin: "0 0 8px", letterSpacing: "0.04em" }}>WARNING — PERMANENT DELETION</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {["Transactions & history", "Budgets & goals", "AI chat history", "Financial score data", "Profile information"].map((item) => (
                      <div key={item} style={{ display: "flex", gap: 7, alignItems: "center" }}>
                        <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#f87171", flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: "rgba(148,163,184,0.7)" }}>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Confirm checkbox */}
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 20, fontSize: 12, color: "rgba(148,163,184,0.6)" }}>
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "#f87171", cursor: "pointer" }} />
              I understand this will permanently delete my account and all data.
            </label>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="modal-btn" disabled={!confirmed} onClick={handleDelete}
                style={{ background: confirmed ? "linear-gradient(135deg,#dc2626,#f87171)" : "rgba(248,113,113,0.15)", color: confirmed ? "#fff" : "rgba(248,113,113,0.4)", cursor: confirmed ? "pointer" : "not-allowed" }}>
                Delete Forever
              </button>
              <button className="modal-btn modal-btn-cancel" onClick={onClose}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default DeleteAccountModal;