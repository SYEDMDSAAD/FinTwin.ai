import { useState } from "react";
import { AlertTriangle, ShieldCheck, TrendingUp, Zap, BarChart2, Calendar, ThumbsDown, ThumbsUp, Check } from "lucide-react";
import API from "../services/api";
import toast from "react-hot-toast";
import { SectionHeader, IconChip, Badge, Button } from "./ui";

const SEVERITY = {
  high:   { tone: "bad",  label: "High" },
  medium: { tone: "warn", label: "Medium" },
  low:    { tone: "info", label: "Low" },
};

const TYPE_META = {
  merchant_spike:    { icon: TrendingUp, label: "Bigger than usual at this shop" },
  category_spike:    { icon: BarChart2,  label: "Category surge" },
  category_surge:    { icon: BarChart2,  label: "Category surge" },
  large_single:      { icon: Zap,        label: "Large payment" },
  large_transaction: { icon: Zap,        label: "Large payment" },
  burst:             { icon: Calendar,   label: "Many payments at once" },
};

// What the backend records with a verdict: the figures that raised the alert,
// so false alarms can be measured per kind of alert.
const verdictBody = (a) => ({
  type: a.type, merchant: a.merchant, category: a.category,
  amount: a.amount, avgAmount: a.avgAmount, multiplier: a.multiplier, severity: a.severity,
});

function AnomalyCard({ anomaly, onDismiss }) {
  const [dismissing, setDismissing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const sev  = SEVERITY[anomaly.severity] || SEVERITY.low;
  const meta = TYPE_META[anomaly.type] || TYPE_META[anomaly.anomaly_type] || { icon: AlertTriangle, label: "Unusual payment" };

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      await API.post("/anomalies/dismiss", verdictBody(anomaly));
      toast.success("Marked as not an anomaly");
      onDismiss(anomaly);
    } catch {
      toast.error("Failed to dismiss");
      setDismissing(false);
    }
  };

  // "Yes, that was odd": the alert was right. It stays on screen.
  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await API.post("/anomalies/confirm", verdictBody(anomaly));
      setConfirmed(true);
      toast.success("Thanks — worth checking that charge");
    } catch {
      toast.error("Couldn't save that. Try again.");
    } finally {
      setConfirming(false);
    }
  };

  const rupee = (v) => `₹${Math.round(v || 0).toLocaleString("en-IN")}`;
  return (
    <li className="px-4 py-4">
      <div className="flex items-start gap-3">
        <IconChip icon={meta.icon} tone={sev.tone} size="sm" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-body text-ink truncate">{anomaly.merchant}</p>
              <p className="text-small text-ink-3 truncate">
                {meta.label}{anomaly.category && anomaly.category !== "Multiple" ? ` · ${anomaly.category}` : ""}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-body font-semibold text-ink num">{rupee(anomaly.amount)}</p>
              {anomaly.multiplier ? (
                <p className="text-small text-ink-3 num">{anomaly.multiplier.toFixed(1)}× usual</p>
              ) : anomaly.avgAmount != null ? (
                <p className="text-small text-ink-3 num">usually {rupee(anomaly.avgAmount)}</p>
              ) : null}
            </div>
          </div>
          {anomaly.reason && <p className="mt-2 text-small text-ink-2">{anomaly.reason}</p>}
          {anomaly.action && <p className="mt-1 text-small text-ink-3">{anomaly.action}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {confirmed ? (
              <span role="status" className="inline-flex items-center gap-1.5 text-small font-medium text-ink-2">
                <Check size={14} aria-hidden /> You marked this as unusual
              </span>
            ) : (
              <Button variant="secondary" size="sm" icon={ThumbsUp} onClick={handleConfirm} disabled={confirming || dismissing}>
                {confirming ? "Saving…" : "Yes, that was odd"}
              </Button>
            )}
            <Button variant="ghost" size="sm" icon={ThumbsDown} onClick={handleDismiss} disabled={dismissing}>
              {dismissing ? "Dismissing…" : "Not an anomaly"}
            </Button>
            {anomaly.severity === "high" && <Badge tone="bad" className="ml-auto">{sev.label}</Badge>}
          </div>
        </div>
      </div>
    </li>
  );
}

// What a dismissal covers: the backend stores "not an anomaly" per type and
// merchant, so every card of that pattern goes at once.
const patternOf = (a) => (a.type ?? a.anomaly_type ?? "") + "|" + (a.merchant || "");

// A card's identity is the anomaly it shows, never its position in the list:
// with index keys, removing card #1 handed its "Dismissing…" state to the
// card that moved into its slot, which then looked stuck.
function withStableKeys(list) {
  const seen = new Map();
  return list.map(a => {
    const base = [patternOf(a), a.category ?? "", a.amount ?? "", a.reason ?? ""].join("|");
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return { anomaly: a, key: n === 1 ? base : `${base}#${n}` };
  });
}

function AnomalyAlerts({ anomalies: incoming }) {
  // Derived from props on every render, so anomalies that load (or reload)
  // after this mounts still show; only the user's dismissals are local.
  const [dismissed, setDismissed] = useState(() => new Set());
  const anomalies = (incoming || []).filter(a => !dismissed.has(patternOf(a)));

  const handleDismiss = (a) => {
    setDismissed(prev => new Set(prev).add(patternOf(a)));
  };

  return (
    <section aria-label="Unusual spending" className="max-w-2xl mb-8">
      <SectionHeader title="Unusual spending" subtitle={anomalies.length ? `${anomalies.length} found` : null} />
      <ul className="rounded-card bg-surface border border-line divide-y divide-line">
        {anomalies.length === 0 ? (
          <li className="flex items-center gap-3 px-4 py-3.5">
            <IconChip icon={ShieldCheck} tone="good" />
            <span>
              <span className="block text-body text-ink">No unusual spending</span>
              <span className="block text-small text-ink-3">Your shops and categories look normal.</span>
            </span>
          </li>
        ) : withStableKeys(anomalies).map(({ anomaly, key }) => (
          <AnomalyCard key={key} anomaly={anomaly} onDismiss={handleDismiss} />
        ))}
      </ul>
    </section>
  );
}

export default AnomalyAlerts;
