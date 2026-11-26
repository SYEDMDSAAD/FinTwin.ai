import { useEffect, useState } from "react";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { guard, guardEnabled } from "../services/guardApi";
import { Button } from "./ui";

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

/** Monday of this week, local time: the week Spend Guard's allowance runs on. */
function weekStart(now = new Date()) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
}

/**
 * Spend Guard on the dashboard: this week at a glance and a way in. Shown only
 * to accounts Spend Guard is open to (the backend's /guard/enabled), so
 * nobody sees a card they can't use. A failed read just hides it.
 */
export default function SpendGuardCard({ onOpen }) {
    const [wallet, setWallet] = useState(null);

    useEffect(() => {
        let live = true;
        guardEnabled()
            .then((on) => (on ? guard("wallet") : null))
            .then((w) => { if (live && w) setWallet(w); })
            .catch(() => {});
        return () => { live = false; };
    }, []);

    if (!wallet) return null;
    const since = weekStart();
    const thisWeek = (wallet.recent || []).filter((e) => e.type === "scan" && new Date(e.at) >= since);
    const pauses = thisWeek.filter((e) => e.decision === "pause").length;
    const days = wallet.daysToAllowance;
    const stats = [
        { label: "Spending money left", short: "Left this week", value: inr(wallet.balances?.spending),
          note: days == null ? "this week" : `${days} day${days === 1 ? "" : "s"} to your next allowance` },
        { label: "Saved by pausing", short: "Saved", value: inr(wallet.savedByPausing), note: "payments you skipped or put off" },
        { label: "Payments checked", short: "Checked", value: String(thisWeek.length), note: `${pauses} paused this week` },
    ];

    const used = wallet.recent?.length > 0;
    return (
        <section aria-labelledby="sg-dash-title" className="rounded-card bg-surface border border-line p-4 md:p-5">
            <div className="flex items-start gap-3">
                <span className="shrink-0 w-10 h-10 rounded-full bg-accent-soft text-accent flex items-center justify-center">
                    <ShieldCheck size={18} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                    <h2 id="sg-dash-title" className="text-heading text-ink">Spend Guard</h2>
                    <p className="text-small text-ink-3 mt-0.5">
                        {used
                            ? [stats[0].note, stats[2].note].join(" · ")
                            : "Scan a QR before you pay. It pauses only when it matters."}
                    </p>
                </div>
            </div>
            {used && (
                <dl className="mt-4 grid grid-cols-3 divide-x divide-line rounded-control bg-surface-sunken py-3">
                    {stats.map((s) => (
                        <div key={s.label} className="px-3 min-w-0">
                            <dt className="text-caption text-ink-3 truncate">{s.short}</dt>
                            <dd className="text-heading text-ink num mt-0.5 truncate">{s.value}</dd>
                        </div>
                    ))}
                </dl>
            )}
            <Button variant="secondary" className="mt-4 w-full" onClick={onOpen}>
                {used ? "Open Spend Guard" : "Try Spend Guard"} <ArrowRight size={16} aria-hidden />
            </Button>
        </section>
    );
}
