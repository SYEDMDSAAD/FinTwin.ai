import { useState, useEffect } from "react";
import { Plus, ShieldCheck, X, HeartPulse, Car, Home, Plane, Umbrella } from "lucide-react";
import { Button, Badge, SectionHeader, EmptyState, cx } from "../components/ui";
import { rupees } from "../utils/money";
import API from "../services/api";
import toast from "react-hot-toast";

const POLICY_TYPES = ["Life","Health","Term","Vehicle","Home","Travel","Critical Illness"];
const FREQUENCIES  = ["Monthly","Quarterly","Half-Yearly","Annually"];

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function renewal(days) {
  if (days == null) return null;
  if (days < 0) return { tone: "bad", text: `Expired ${Math.abs(days)} days ago` };
  if (days < 30) return { tone: "bad", text: `Renews in ${days} days` };
  if (days < 90) return { tone: "warn", text: `Renews in ${days} days` };
  return { tone: "neutral", text: `Renews in ${days} days` };
}

const TYPE_ICON = { Life: Umbrella, Term: Umbrella, Health: HeartPulse, "Critical Illness": HeartPulse, Vehicle: Car, Home: Home, Travel: Plane };

const EMPTY = { type: "Life", provider: "", premium: "", frequency: "Annually", sumAssured: "", renewalDate: "", notes: "" };
const PER = { Monthly: "a month", Quarterly: "a quarter", "Half-Yearly": "every 6 months", Annually: "a year" };

function PolicyRow({ policy, onDelete }) {
  const days = daysUntil(policy.renewalDate);
  const r = renewal(days);
  const Icon = TYPE_ICON[policy.type] || ShieldCheck;
  return (
    <li className="flex items-start gap-3 px-4 py-3.5">
      <span aria-hidden className="shrink-0 w-10 h-10 rounded-full bg-surface-sunken text-ink-2 flex items-center justify-center"><Icon size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-body text-ink">{policy.provider || "Unknown provider"}</span>
          {r && r.tone !== "neutral" && <Badge tone={r.tone}>{r.tone === "bad" && days < 0 ? "Expired" : "Renew soon"}</Badge>}
        </span>
        <span className="block text-small text-ink-3">
          {policy.type} · {rupees(policy.premium)} {PER[policy.frequency] || policy.frequency?.toLowerCase()}
        </span>
        <span className={cx("block text-small", r?.tone === "bad" ? "text-bad" : "text-ink-3")}>
          {r ? r.text : "No renewal date"}{policy.notes ? ` · ${policy.notes}` : ""}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-body font-semibold text-ink num">{rupees(policy.sumAssured)}</span>
        <span className="block text-caption text-ink-3">cover</span>
      </span>
      <button type="button" onClick={() => onDelete(policy.id)} aria-label={`Remove ${policy.provider || "policy"}`}
              className="shrink-0 -mr-1.5 w-8 h-8 rounded-full flex items-center justify-center text-ink-3 hover:bg-surface-sunken">
        <X size={16} aria-hidden />
      </button>
    </li>
  );
}

const INPUT = "w-full h-11 rounded-control bg-surface-sunken border border-transparent px-3 text-body text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent";

function Field({ label, children, wide }) {
  return (
    <label className={cx("block", wide && "col-span-2")}>
      <span className="block text-small text-ink-2 mb-1">{label}</span>
      {children}
    </label>
  );
}

function AddModal({ onClose, onSave, saving }) {
  const [form, setForm] = useState(EMPTY);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Add a policy">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-[24px] sm:rounded-card bg-surface p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-title text-ink">Add a policy</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-2 rounded-full flex items-center justify-center text-ink-3 hover:bg-surface-sunken"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type" wide>
            <select className={INPUT} value={form.type} onChange={set("type")}>
              {POLICY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Insurer" wide>
            <input className={INPUT} placeholder="LIC, HDFC Ergo…" value={form.provider} onChange={set("provider")} />
          </Field>
          <Field label="Premium ₹"><input type="number" inputMode="numeric" className={INPUT} placeholder="5000" value={form.premium} onChange={set("premium")} /></Field>
          <Field label="Paid">
            <select className={INPUT} value={form.frequency} onChange={set("frequency")}>
              {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Cover ₹"><input type="number" inputMode="numeric" className={INPUT} placeholder="1000000" value={form.sumAssured} onChange={set("sumAssured")} /></Field>
          <Field label="Renews on"><input type="date" className={INPUT} value={form.renewalDate} onChange={set("renewalDate")} /></Field>
          <Field label="Notes (optional)" wide>
            <input className={INPUT} placeholder="Policy number, agent…" value={form.notes} onChange={set("notes")} />
          </Field>
        </div>
        <div className="flex gap-2 mt-5">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" disabled={!form.provider.trim() || saving} onClick={() => { if (form.provider.trim()) onSave(form); }}>
            {saving ? "Saving…" : "Add policy"}
          </Button>
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
    <div className="max-w-2xl mb-8">
      {policies.length > 0 && (
        <section aria-label="Your cover" className="px-1 mb-8">
          <p className="text-small text-ink-3">Total cover</p>
          <p className="text-hero text-ink num mt-1">{rupees(totalCoverage)}</p>
          <p className="mt-2 text-body text-ink-2">
            {policies.length} {policies.length === 1 ? "policy" : "policies"}
            {urgentCount > 0 && <> · <span className="text-bad font-medium">{urgentCount} to renew within 30 days</span></>}
          </p>
        </section>
      )}

      <SectionHeader
        title="Policies"
        action={<Button size="sm" icon={Plus} onClick={() => setShowAdd(true)}>Add Policy</Button>}
      />

      {loading ? (
        <div className="rounded-card bg-surface border border-line px-6 py-10 text-center text-small text-ink-3">Loading…</div>
      ) : policies.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No policies yet"
                    body="Add your life, health, vehicle or term policies to see your cover in one place and get a nudge before each renewal." />
      ) : (
        <ul className="rounded-card bg-surface border border-line divide-y divide-line">
          {policies.map(p => <PolicyRow key={p.id} policy={p} onDelete={handleDelete} />)}
        </ul>
      )}

      {showAdd && <AddModal onClose={() => setShowAdd(false)} onSave={handleSave} saving={saving} />}
    </div>
  );
}
