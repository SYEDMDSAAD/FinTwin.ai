import { useState } from "react";
import { Plus, X, RefreshCw, Calendar } from "lucide-react";

const STORAGE_KEY = "fintwin-sips";
const FREQUENCIES  = ["Monthly","Quarterly"];

function getSIPs() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}
function saveSIPs(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

const EMPTY = { fundName: "", amount: "", frequency: "Monthly", nextDebitDate: "", notes: "" };
const CARD = { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "18px 20px", position: "relative", overflow: "hidden" };

function SIPCard({ sip, onDelete }) {
  const days = daysUntil(sip.nextDebitDate);
  const urgent = days != null && days <= 5;

  return (
    <div style={{ ...CARD, borderLeft: "3px solid #a78bfa" }}>
      <div style={{ position: "absolute", inset: "0 0 auto", height: 1, background: "linear-gradient(90deg,transparent,rgba(167,139,250,0.3),transparent)" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {sip.fundName}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-label)" }}>{sip.frequency} SIP</div>
        </div>
        <button onClick={() => onDelete(sip.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dimmer)", padding: 4, display: "flex" }}>
          <X size={14} />
        </button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600, marginBottom: 3 }}>MONTHLY AMOUNT</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#a78bfa" }}>₹{parseFloat(sip.amount || 0).toLocaleString("en-IN")}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600, marginBottom: 3 }}>NEXT DEBIT</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, color: urgent ? "#f87171" : "var(--text-secondary)", fontSize: 13, fontWeight: 600 }}>
            <Calendar size={12} />
            {sip.nextDebitDate || "Not set"}
            {days != null && (
              <span style={{ fontSize: 10, color: urgent ? "#f87171" : "#fbbf24", background: urgent ? "rgba(248,113,113,0.1)" : "rgba(251,191,36,0.1)", borderRadius: 5, padding: "1px 6px" }}>
                {days === 0 ? "Today!" : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
              </span>
            )}
          </div>
        </div>
      </div>
      {sip.notes && <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-dim)" }}>{sip.notes}</div>}
    </div>
  );
}

export default function SIPTracker() {
  const [sips, setSIPs] = useState(getSIPs);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const totalMonthly = sips.reduce((s, sip) => s + parseFloat(sip.amount || 0), 0);

  const handleSave = () => {
    if (!form.fundName.trim() || !form.amount) return;
    const next = [...sips, { id: Date.now().toString(), ...form }];
    setSIPs(next); saveSIPs(next); setShowAdd(false); setForm(EMPTY);
  };
  const handleDelete = (id) => {
    const next = sips.filter(s => s.id !== id);
    setSIPs(next); saveSIPs(next);
  };

  return (
    <div>
      {/* Summary row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.1em", marginBottom: 2 }}>TOTAL MONTHLY SIP</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#a78bfa" }}>₹{totalMonthly.toLocaleString("en-IN")}</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{sips.length} active SIP{sips.length !== 1 ? "s" : ""}</div>
        </div>
        <button
          onClick={() => setShowAdd(o => !o)}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 12, border: "none", background: "rgba(167,139,250,0.12)", border2: "1px solid rgba(167,139,250,0.2)", color: "#a78bfa", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: "1px solid rgba(167,139,250,0.25)" }}
        >
          <Plus size={14} /> Add SIP
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ background: "rgba(167,139,250,0.04)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Fund Name *</label>
              <input style={inp} placeholder="e.g. Parag Parikh Flexi Cap Fund" value={form.fundName} onChange={e => setForm({...form, fundName: e.target.value})} />
            </div>
            <div>
              <label style={lbl}>Monthly Amount (₹) *</label>
              <input type="number" style={inp} placeholder="5000" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} />
            </div>
            <div>
              <label style={lbl}>Frequency</label>
              <select style={inp} value={form.frequency} onChange={e => setForm({...form, frequency: e.target.value})}>
                {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Next Debit Date</label>
              <input type="date" style={inp} value={form.nextDebitDate} onChange={e => setForm({...form, nextDebitDate: e.target.value})} />
            </div>
            <div>
              <label style={lbl}>Notes</label>
              <input style={inp} placeholder="AMFI code, folio no., etc." value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setShowAdd(false); setForm(EMPTY); }} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "none", color: "var(--text-muted)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            <button
              onClick={handleSave}
              disabled={!form.fundName.trim() || !form.amount}
              style={{ flex: 1, padding: "8px 0", borderRadius: 10, border: "none", background: "rgba(167,139,250,0.15)", color: "#a78bfa", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: form.fundName.trim() && form.amount ? 1 : 0.4 }}
            >
              Add SIP
            </button>
          </div>
        </div>
      )}

      {/* SIP list */}
      {sips.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-dimmer)", fontSize: 13 }}>
          <RefreshCw size={36} style={{ opacity: 0.2, marginBottom: 12 }} />
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No SIPs tracked yet</div>
          <div>Add your monthly SIP investments to track debit dates and totals.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {sips.map(sip => <SIPCard key={sip.id} sip={sip} onDelete={handleDelete} />)}
        </div>
      )}
    </div>
  );
}

const lbl = { display: "block", fontSize: 10, fontWeight: 700, color: "var(--text-label)", letterSpacing: "0.08em", marginBottom: 5 };
const inp = { width: "100%", padding: "8px 11px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
