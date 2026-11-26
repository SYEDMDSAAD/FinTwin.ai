import { useState } from "react";
import { X, AlertOctagon, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import API from "../services/api";
import { SectionHeader, IconChip, Button } from "./ui";

/* Everything FinTwin noticed, worst first, each one dismissable. */

const KIND = {
    danger: { icon: AlertOctagon, tone: "bad" },
    warning: { icon: AlertTriangle, tone: "warn" },
    success: { icon: CheckCircle2, tone: "good" },
    info: { icon: Info, tone: "info" },
};
const RANK = { danger: 0, warning: 1, info: 2, success: 3 };
const SHOWN = 4;

function SmartNotifications({ notifications, setNotifications }) {
    const [all, setAll] = useState(false);

    // The index is the backend's position in the list it sent, so dismiss by it
    const removeNotification = async (index) => {
        try {
            await API.delete(`/notifications/${index}`);
            setNotifications((prev) => prev.filter((_, i) => i !== index));
        } catch (error) {
            console.error("Notification dismiss failed:", error);
        }
    };

    const items = (notifications || [])
        .map((n, index) => ({ ...n, index }))
        .sort((a, b) => (RANK[a.type] ?? 2) - (RANK[b.type] ?? 2));
    const visible = all ? items : items.slice(0, SHOWN);

    return (
        <section aria-label="Alerts" className="max-w-2xl mb-8">
            <SectionHeader title="Alerts" subtitle={items.length ? `${items.length} to look at` : null} />
            <ul className="rounded-card bg-surface border border-line divide-y divide-line">
                {items.length === 0 && (
                    <li className="flex items-center gap-3 px-4 py-3.5">
                        <IconChip icon={CheckCircle2} tone="good" />
                        <span>
                            <span className="block text-body text-ink">You're all caught up</span>
                            <span className="block text-small text-ink-3">Nothing needs a look right now.</span>
                        </span>
                    </li>
                )}
                {visible.map((n) => {
                    const k = KIND[n.type] || KIND.info;
                    return (
                        <li key={n.index} className="flex items-start gap-3 px-4 py-3.5">
                            <IconChip icon={k.icon} tone={k.tone} size="sm" className="mt-0.5" />
                            <p className="flex-1 text-small text-ink leading-snug pt-1.5">{n.message}</p>
                            <button
                                type="button"
                                onClick={() => removeNotification(n.index)}
                                aria-label="Dismiss"
                                className="shrink-0 -mr-1.5 w-8 h-8 rounded-full flex items-center justify-center text-ink-3 hover:bg-surface-sunken"
                            >
                                <X size={16} aria-hidden />
                            </button>
                        </li>
                    );
                })}
            </ul>
            {items.length > SHOWN && (
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAll((v) => !v)}>
                    {all ? "Show fewer" : `Show all ${items.length}`}
                </Button>
            )}
        </section>
    );
}

export default SmartNotifications;
