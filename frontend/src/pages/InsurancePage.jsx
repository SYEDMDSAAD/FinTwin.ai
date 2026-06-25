import { useState, useEffect } from "react";
import { Plus, ShieldCheck, X, AlertTriangle } from "lucide-react";
import API from "../services/api";
import toast from "react-hot-toast";

const POLICY_TYPES = ["Life","Health","Term","Vehicle","Home","Travel","Critical Illness"];
const FREQUENCIES  = ["Monthly","Quarterly","Half-Yearly","Annually"];

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function RenewalBadge({ days }) {
  if (days == null) return null;
  if (days < 0)  return <span style={badge("#f87171")}>Expired {Math.abs(days)}d ago</span>;
  if (days < 30) return <span style={badge("#f87171")}>{days}d left ⚠</span>;
  if (days < 90) return <span style={badge("#fbbf24")}>{days}d left</span>;
  return <span style={badge("#4ade80")}>{days}d left</span>;
}

const badge = (c) => ({
  fontSize: 10, fontWeight: 700, color: c,
  background: c + "18", border: `1px solid ${c}30`,
  borderRadius: 6, padding: "2px 8px",
});

const TYPE_COLORS = { Life:"#22d3ee", Health:"#4ade80", Term:"#a78bfa", Vehicle:"#fbbf24", Home:"#f472b6", Travel:"#38bdf8", "Critical Illness":"#f87171" };

const EMPTY = { type:"Life", provider:"", premium:"", frequency:"Annually", sumAssured:"", renewalDate:"", notes:"" };

function PolicyCard({ policy, onDelete }) {
  const days = daysUntil(policy.renewalDate);
  const color = TYPE_COLORS[policy.type] || "#94a3b8";
  const urgent = days != null && days < 30;

  return (
    <div style={{
      position: "relative", overflow: "hidden",
      background: urgent ? "rgba(248,113,113,0.04)" : "rgba(255,255,255,0.025)",
      border: `1px solid ${urgent ? "rgba(248,113,113,0.2)" : "rgba(255,255,255,0.07)"}`,
      borderRadius: 18, padding: "20px 22px",
      borderLeft: `3px solid ${color}`,
      transition: "all 0.2s",
    }}>
      <div style={{ position: "absolute", inset: "0 0 auto", height: 1, background: `linear-gradient(90deg,transparent,${color}30,transparent)` }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: color+"2e", border: `1px solid ${color}55`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ShieldCheck size={18} color={color} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{policy.provider || "Unknown Provider"}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color, marginTop: 2 }}>{policy.type} Insurance</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <RenewalBadge days={days} />
          <button onClick={() => onDelete(policy.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dimmer)", padding: 4, display: "flex" }}>
            <X size={14} />
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600, marginBottom: 3 }}>PREMIUM</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
            ₹{parseFloat(policy.premium || 0).toLocaleString("en-IN")}
            <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 400, marginLeft: 4 }}>/{policy.frequency?.toLowerCase()}</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600, marginBottom: 3 }}>SUM ASSURED</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#4ade80" }}>
            ₹{parseFloat(policy.sumAssured || 0).toLocaleString("en-IN")}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600, marginBottom: 3 }}>RENEWAL DATE</div>
          <div style={{ fontSize: 13, color: days != null && days < 30 ? "#f87171" : "var(--text-secondary)", display: "flex", alignItems: "center", gap: 5 }}>
            {urgent && <AlertTriangle size={11} />}
            {policy.renewalDate || "Not set"}
          </div>
        </div>
        {policy.notes && (
          <div>
            <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600, marginBottom: 3 }}>NOTES</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{policy.notes}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function AddModal({ onClose, onSave, saving }) {
  const [form, setForm] = useState(EMPTY);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 460, background: "#0e1018", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 24, position: "relative" }}>
        <div style={{ position: "absolute", inset: "0 0 auto", height: 1, background: "linear-gradient(90deg,transparent,rgba(34,211,238,0.4),transparent)", borderRadius: 20 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: 0 }}>Add Insurance Policy</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 4 }}><X size={16} /></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={lbl}>Insurance Type</label>
            <select style={inp} value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
              {POLICY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={lbl}>Provider / Company *</label>
            <input style={inp} placeholder="e.g. LIC, HDFC Ergo" value={form.provider} onChange={e => setForm({...form, provider: e.target.value})} />
          </div>
          <div>
            <label style={lbl}>Premium Amount (₹)</label>
            <input type="number" style={inp} placeholder="5000" value={form.premium} onChange={e => setForm({...form, premium: e.target.value})} />
          </div>
          <div>
            <label style={lbl}>Frequency</label>
            <select style={inp} value={form.frequency} onChange={e => setForm({...form, frequency: e.target.value})}>
              {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Sum Assured (₹)</label>
            <input type="number" style={inp} placeholder="1000000" value={form.sumAssured} onChange={e => setForm({...form, sumAssured: e.target.value})} />
          </div>
          <div>
            <label style={lbl}>Renewal Date</label>
            <input type="date" style={inp} value={form.renewalDate} onChange={e => setForm({...form, renewalDate: e.target.value})} />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={lbl}>Notes (optional)</label>
            <input style={inp} placeholder="Policy number, agent, etc." value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button
            disabled={!form.provider.trim() || saving}
            onClick={() => { if (form.provider.trim()) onSave(form); }}
            style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#22d3ee,#0891b2)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: (form.provider.trim() && !saving) ? 1 : 0.4 }}
          >
            {saving ? "Saving…" : "Add Policy"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InsurancePage() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showAdd, setShowAdd]   = useState(false);
  const [saving, setSaving]     = useState(false);

  useEffect(() => { fetchPolicies(); }, []);

  const fetchPolicies = async () => {
    try {
      const r = await API.get("/insurance");
      setPolicies(r.data || []);
    } catch { toast.error("Failed to load insurance policies"); }
    finally { setLoading(false); }
  };

  const totalCoverage = policies.reduce((s,p) => s + parseFloat(p.sumAssured||0), 0);
  const urgentCount = policies.filter(p => { const d = daysUntil(p.renewalDate); return d != null && d < 30; }).length;

  const handleSave = async (form) => {
    setSaving(true);
    try {
      const payload = {
        type: form.type,
        provider: form.provider,
        premium: form.premium || null,
        frequency: form.frequency,
        sumAssured: form.sumAssured || null,
        renewalDate: form.renewalDate || null,
        notes: form.notes || null,
      };
      const r = await API.post("/insurance", payload);
      setPolicies(prev => [r.data, ...prev]);
      setShowAdd(false);
      toast.success("Policy added");
    } catch { toast.error("Failed to add policy"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try {
      await API.delete(`/insurance/${id}`);
      setPolicies(prev => prev.filter(p => p.id !== id));
      toast.success("Policy removed");
    } catch { toast.error("Failed to remove policy"); }
  };

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ShieldCheck size={18} color="#22d3ee" />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-label)", letterSpacing: "0.12em" }}>PROTECTION</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: 0 }}>Insurance</h2>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#22d3ee,#0891b2)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          <Plus size={15} /> Add Policy
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
        <SummaryCard label="Total Coverage" value={`₹${totalCoverage.toLocaleString("en-IN")}`} color="#4ade80" icon="🛡️" />
        <SummaryCard label="Active Policies" value={policies.length} color="#22d3ee" icon="📋" />
        <SummaryCard label="Renewing Soon (30d)" value={urgentCount} color={urgentCount > 0 ? "#f87171" : "#4ade80"} icon={urgentCount > 0 ? "⚠️" : "✅"} />
        {POLICY_TYPES.map(t => {
          const count = policies.filter(p=>p.type===t).length;
          if (!count) return null;
          return <SummaryCard key={t} label={t} value={`${count} polic${count===1?"y":"ies"}`} color={TYPE_COLORS[t]||"#94a3b8"} icon="🔐" />;
        })}
      </div>

      {/* Policies */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: 13 }}>Loading…</div>
      ) : policies.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-dimmer)" }}>
          <ShieldCheck size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No insurance policies tracked</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>Add your Life, Health, Vehicle or Term policies to track renewals and coverage.</div>
          <button onClick={() => setShowAdd(true)} style={{ padding: "10px 20px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#22d3ee,#0891b2)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            + Add Policy
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {policies.map(p => <PolicyCard key={p.id} policy={p} onDelete={handleDelete} />)}
        </div>
      )}

      {showAdd && <AddModal onClose={() => setShowAdd(false)} onSave={handleSave} saving={saving} />}
    </div>
  );
}

function SummaryCard({ label, value, color, icon }) {
  return (
    <div style={{ position: "relative", overflow: "hidden", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ position: "absolute", inset: "0 0 auto", height: 1, background: `linear-gradient(90deg,transparent,${color}30,transparent)` }} />
      <div style={{ fontSize: 18, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em", marginBottom: 4 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

const lbl = { display: "block", fontSize: 10, fontWeight: 700, color: "var(--text-label)", letterSpacing: "0.08em", marginBottom: 6 };
const inp = { width: "100%", padding: "9px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
