import { useEffect, useState } from "react";
import { Sparkles, Clock, ArrowRight } from "lucide-react";

import API from "../services/api";

export const inr = (value) =>
    "₹" + Math.round(value || 0).toLocaleString("en-IN");

// Charges are grouped by day so the eye can find "yesterday" without reading
// dates. Anything older than a week is just its date.
export function dayLabel(dateStr, today = new Date()) {
    if (!dateStr) return "";

    const date = new Date(dateStr + "T00:00:00");
    if (Number.isNaN(date.getTime())) return "";

    const midnight = new Date(today);
    midnight.setHours(0, 0, 0, 0);

    const days = Math.round((midnight - date) / 86400000);

    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) {
        return date.toLocaleDateString("en-IN", { weekday: "long" });
    }
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function groupByDay(charges = [], today = new Date()) {
    const groups = [];
    for (const charge of charges) {
        const label = dayLabel(charge.date, today);
        const last = groups[groups.length - 1];
        if (last && last.label === label) last.charges.push(charge);
        else groups.push({ label, charges: [charge] });
    }
    return groups;
}

// The rail a charge arrived on. Worth showing only because card spending was
// invisible until recently — seeing "CARD" beside a charge is what tells the
// user the card is actually connected.
const SOURCE_LABEL = {
    CARD:   "Card",
    BANK:      "Bank",
    STATEMENT: "Statement",
    MANUAL:    "Added by you",
};

const SHOWN = 5;

/**
 * "Since you last looked": a short recap at the top of Home, shown when
 * daily insights are on (Settings → AI preferences).
 */
function DailyRecap() {

    const [recap,   setRecap]   = useState(null);
    const [loading, setLoading] = useState(true);
    const [failed,  setFailed]  = useState(false);
    const [all,     setAll]     = useState(false);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const { data } = await API.get("/daily-recap");
                if (cancelled) return;
                setRecap(data);

                // Marked seen only once it has actually rendered, and never as
                // part of the GET — a refresh must not blank the page.
                API.post("/daily-recap/seen").catch(() => {});
            } catch {
                if (!cancelled) setFailed(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, []);

    const card = "rounded-card bg-surface border border-line p-5";
    const kicker = "text-[11px] font-semibold tracking-[0.1em] text-ink-3";

    if (loading) {
        return (
            <section className={card} aria-busy="true">
                <div className="h-5 w-2/3 rounded bg-surface-sunken animate-pulse" />
                <div className="h-4 w-1/2 rounded bg-surface-sunken animate-pulse mt-3" />
            </section>
        );
    }

    if (failed || !recap) {
        return (
            <section className={card}>
                <p className="text-small text-ink-3">
                    Your recap could not be loaded just now. Your transactions are unaffected.
                </p>
            </section>
        );
    }

    const charges = recap.charges || [];
    const groups = groupByDay(all ? charges : charges.slice(0, SHOWN));

    return (
        <section className={card} aria-label="Daily recap">
            <div className="flex items-center gap-2 mb-2">
                <Sparkles size={14} aria-hidden className="text-accent" />
                <span className={kicker}>
                    {recap.firstVisit ? "YOUR FIRST LOOK" : "SINCE YOU LAST LOOKED"}
                </span>
            </div>

            <h2 className="text-[18px] leading-snug font-[650] text-ink">{recap.headline}</h2>

            {recap.lines?.length > 0 && (
                <div className="mt-2 space-y-1">
                    {recap.lines.map((line, i) => (
                        <p key={i} className="text-small text-ink-2">{line}</p>
                    ))}
                </div>
            )}

            {recap.upcoming?.length > 0 && (
                <div className="mt-4 rounded-xl bg-surface-sunken p-3">
                    <div className="flex items-center gap-2 mb-2">
                        <Clock size={13} aria-hidden className="text-warn" />
                        <span className={kicker}>LANDING THIS WEEK</span>
                    </div>
                    <div className="space-y-1.5">
                        {recap.upcoming.map((charge, i) => (
                            <div key={i} className="flex items-center justify-between gap-3 text-small">
                                <span className="text-ink-2 truncate">{charge.merchant}</span>
                                <span className="font-semibold text-ink num shrink-0">{inr(charge.amount)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {groups.length > 0 && (
                <div className="mt-4">
                    {groups.map((group) => (
                        <div key={group.label} className="mb-3 last:mb-0">
                            <div className={`${kicker} mb-1`}>{group.label.toUpperCase()}</div>
                            {group.charges.map((charge, i) => (
                                <div key={i} className="flex items-center justify-between gap-3 py-1.5">
                                    <div className="min-w-0">
                                        <div className="text-small text-ink truncate">{charge.merchant}</div>
                                        <div className="text-[12px] text-ink-3">
                                            {charge.category || "Uncategorised"}
                                            {SOURCE_LABEL[charge.source] && <> · {SOURCE_LABEL[charge.source]}</>}
                                        </div>
                                    </div>
                                    <div className="text-small font-semibold text-ink num shrink-0">{inr(charge.amount)}</div>
                                </div>
                            ))}
                        </div>
                    ))}
                    {charges.length > SHOWN && (
                        <button type="button" onClick={() => setAll((v) => !v)}
                                className="mt-1 text-small font-medium text-accent">
                            {all ? "Show fewer" : `Show all ${charges.length}`}
                        </button>
                    )}
                </div>
            )}

            {recap.chargeCount === 0 && (
                <p className="mt-3 flex items-center gap-2 text-small text-ink-3">
                    <ArrowRight size={14} aria-hidden />
                    Nothing to review. Your accounts are connected and quiet.
                </p>
            )}
        </section>
    );
}

export default DailyRecap;
