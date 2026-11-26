const MODAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap');
  .modal-overlay { position:fixed; inset:0; z-index:50; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.75); backdrop-filter:blur(10px); padding:20px; font-family:inherit; }
  .modal-box { position:relative; width:100%; max-width:480px; background:rgba(10,12,18,0.97); border:1px solid var(--border-card); border-radius:22px; overflow:hidden; box-shadow:0 40px 100px rgba(0,0,0,0.7); }
  .modal-banner { height:100px; position:relative; }
  .modal-content { padding:0 28px 28px; }
  .modal-input-wrap { display:flex; align-items:center; gap:12px; background:var(--bg-input); border:1px solid var(--border-card); border-radius:12px; padding:0 14px; transition:border-color 0.2s; }
  .modal-input-wrap:focus-within { border-color:var(--accent); }
  .modal-input { width:100%; background:transparent; padding:13px 0; color:var(--text-primary); font-size:13px; outline:none; font-family:inherit; }
  .modal-input::placeholder { color:var(--text-dim); }
  .modal-input:disabled { color:var(--text-dim); cursor:not-allowed; }
  .modal-btn { flex:1; padding:13px; border-radius:12px; border:none; font-size:13px; font-weight:700; cursor:pointer; transition:all 0.2s; font-family:inherit;  }
  .modal-btn:hover { opacity:0.9; transform:translateY(-1px); }
  .modal-btn-cancel { background:var(--bg-input); border:1px solid var(--border-card) !important; color:var(--text-secondary); border:none; }
  .modal-btn-cancel:hover { background:var(--bg-input); }
  @keyframes modalIn { from{opacity:0;transform:scale(0.95) translateY(12px)} to{opacity:1;transform:scale(1) translateY(0)} }
  .modal-in { animation: modalIn 0.22s ease both; }
`;

// ─── DeleteAccountModal.jsx ───────────────────────────────────────────────────
import { Trash2, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { X } from "lucide-react";
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
        <div className="modal-box modal-in" style={{ boxShadow: "0 40px 100px var(--bad-soft), 0 0 0 1px var(--bad-soft)" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg,transparent,var(--bad),var(--warn),transparent)" }} />

          <div className="modal-banner" style={{ background: "linear-gradient(135deg,#7f1d1d,#dc2626,var(--bad))" }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.2)" }} />
          </div>

          <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, width: 32, height: 32, borderRadius: 9, background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-card)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(255,255,255,0.7)" }}>
            <X size={15} />
          </button>

          <div style={{ position: "absolute", top: 56, left: 28 }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg,#dc2626,var(--bad))", border: "3px solid #0a0c12", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 30px var(--bad-soft)" }}>
              <Trash2 size={26} color="#fff" />
            </div>
          </div>

          <div className="modal-content">
            <div style={{ marginTop: 44, marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--bad)", marginBottom: 4 }}>Danger zone</div>
              <h2 style={{ fontSize: 22, fontWeight: 650, color: "var(--text-primary)", margin: "0 0 4px", letterSpacing: "-0.02em" }}>Delete Account</h2>
              <p style={{ fontSize: 12, color: "var(--text-dim)", margin: 0 }}>This action cannot be undone.</p>
            </div>

            {/* Warning box */}
            <div style={{ background: "var(--bad-soft)", border: "1px solid var(--bad-soft)", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <AlertTriangle size={15} color="var(--bad)" style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--bad)", margin: "0 0 8px" }}>Warning — permanent deletion</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {["Transactions & history", "Budgets & goals", "AI chat history", "Financial score data", "Profile information"].map((item) => (
                      <div key={item} style={{ display: "flex", gap: 7, alignItems: "center" }}>
                        <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--bad)", flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Confirm checkbox */}
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 20, fontSize: 12, color: "var(--text-dim)" }}>
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "var(--bad)", cursor: "pointer" }} />
              I understand this will permanently delete my account and all data.
            </label>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="modal-btn" disabled={!confirmed} onClick={handleDelete}
                style={{ background: confirmed ? "linear-gradient(135deg,#dc2626,var(--bad))" : "var(--bad-soft)", color: confirmed ? "#fff" : "var(--bad-soft)", cursor: confirmed ? "pointer" : "not-allowed" }}>
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