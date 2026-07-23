import { useState, useEffect } from "react";
import { Plus, X, RefreshCw, Calendar } from "lucide-react";

const STORAGE_KEY = "fintwin-sips";
const FREQUENCIES  = ["Monthly","Quarterly"];
const MONTHS_PER_DEBIT = { Monthly: 1, Quarterly: 3 };

function getSIPs() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}
function saveSIPs(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// A ₹30k quarterly SIP is ₹10k/month of committed cashflow — summing raw
// amounts across frequencies overstates the monthly commitment.
export function monthlyEquivalent(sip) {
  const amount = parseFloat(sip.amount || 0);
  return amount / (MONTHS_PER_DEBIT[sip.frequency] || 1);
}

// "yyyy-mm-dd" as a LOCAL date. `new Date(str)` parses it as UTC, which
// shifts the day by one in western timezones.
function parseLocalDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str || "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d) ? null : d;
}

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Real SIPs recur: once a debit date passes, roll it forward by the frequency
// until it is in the future, instead of showing "Nd overdue" forever.
//
// Each candidate is derived from the ORIGINAL anchor (anchor + k months), not
// by mutating the previous result. Mutating drifts: a SIP on the 31st clamps
// to Feb 28, and every later step then anchors on 28 — which both loses the
// intended day and never advances past a short month.
export function rollForward(sip, now = new Date()) {
  const anchor = parseLocalDate(sip.nextDebitDate);
  if (!anchor) return sip;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (anchor >= today) return sip;

  const step = MONTHS_PER_DEBIT[sip.frequency] || 1;
  const day = anchor.getDate();

  let next = anchor;
  // Bounded: covers ~100 years of monthly steps, so a corrupt date can never
  // hang the tab.
  for (let k = step; k <= 1200; k += step) {
    const candidate = new Date(anchor.getFullYear(), anchor.getMonth() + k, 1);
    // Clamp to the last valid day when the target month is shorter, so a
    // 31st SIP lands on Feb 28 without shifting into March.
    const lastDay = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
    candidate.setDate(Math.min(day, lastDay));
    next = candidate;
    if (candidate >= today) break;
  }

  return { ...sip, nextDebitDate: toISODate(next) };
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
          <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600, marginBottom: 3 }}>
            {sip.frequency === "Quarterly" ? "QUARTERLY AMOUNT" : "MONTHLY AMOUNT"}
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#a78bfa" }}>₹{parseFloat(sip.amount || 0).toLocaleString("en-IN")}</div>
          {sip.frequency === "Quarterly" && (
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
              ₹{Math.round(monthlyEquivalent(sip)).toLocaleString("en-IN")}/month equivalent
            </div>
          )}
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

  // Advance any elapsed debit dates on mount and persist the result.
  useEffect(() => {
    const rolled = sips.map(rollForward);
    if (rolled.some((s, i) => s.nextDebitDate !== sips[i].nextDebitDate)) {
      setSIPs(rolled); saveSIPs(rolled);
    }
  }, []);

  const totalMonthly = sips.reduce((s, sip) => s + monthlyEquivalent(sip), 0);

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
          <div style={{ fontSize: 28, fontWeight: 800, color: "#a78bfa" }}>
            ₹{Math.round(totalMonthly).toLocaleString("en-IN")}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
            {sips.length} active SIP{sips.length !== 1 ? "s" : ""} · stored in this browser only
          </div>
        </div>
        <button
          onClick={() => setShowAdd(o => !o)}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 12, background: "rgba(167,139,250,0.12)", color: "#a78bfa", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: "1px solid rgba(167,139,250,0.25)" }}
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
