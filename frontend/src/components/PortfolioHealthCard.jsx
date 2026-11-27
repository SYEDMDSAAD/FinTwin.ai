import { useEffect, useState } from "react";
import { AlertTriangle, Info, Sparkles } from "lucide-react";
import API from "../services/api";
import { SectionHeader, cx } from "./ui";
import { rupees } from "../utils/money";

/*
 * The health check: facts about the portfolio and what they cost, in the
 * spirit of Zerodha's nudges. Never which fund to buy: FinTwin isn't a
 * SEBI-registered adviser.
 */

const TONE = {
    warn: { Icon: AlertTriangle, cls: "text-warn" },
    info: { Icon: Info, cls: "text-ink-3" },
    good: { Icon: Sparkles, cls: "text-good" },
};

export default function PortfolioHealthCard({ refreshKey }) {
    const [health, setHealth] = useState(null);
    const [showTax, setShowTax] = useState(false);

    useEffect(() => {
        let live = true;
        API.get("/portfolio/health").then((r) => { if (live) setHealth(r.data); }).catch(() => {});
        return () => { live = false; };
    }, [refreshKey]);

    const checks = health?.checks || [];
    if (checks.length === 0) return null;
    const taxLines = health?.tax?.holdings || [];

    return (
        <section aria-label="Health check" className="mb-6">
            <SectionHeader title="Health check" />
            <ul className="rounded-card bg-surface border border-line divide-y divide-line">
                {checks.map((c) => {
                    const { Icon, cls } = TONE[c.tone] || TONE.info;
                    return (
                        <li key={c.id} className="flex gap-3 px-4 py-3.5">
                            <Icon size={16} aria-hidden className={cx("shrink-0 mt-0.5", cls)} />
                            <span className="min-w-0">
                                <span className="block text-body text-ink">{c.title}</span>
                                <span className="block text-small text-ink-3 mt-0.5">{c.detail}</span>
                                {c.id === "tax" && taxLines.length > 0 && (
                                    <>
                                        <button type="button" onClick={() => setShowTax((v) => !v)}
                                                className="mt-2 text-small font-medium text-accent">
                                            {showTax ? "Hide the funds" : "Which funds"}
                                        </button>
                                        {showTax && (
                                            <ul className="mt-2 space-y-1">
                                                {taxLines.map((l) => (
                                                    <li key={l.id} className="flex justify-between gap-3 text-small num">
                                                        <span className="text-ink-2 truncate">{l.name}</span>
                                                        <span className="text-ink shrink-0">{rupees(l.gain)} gain · {l.units} units</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </>
                                )}
                            </span>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
