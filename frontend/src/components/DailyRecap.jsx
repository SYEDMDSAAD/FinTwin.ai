import { useEffect, useState } from "react";
import { Sparkles, Clock, ArrowRight } from "lucide-react";

import GlassCard from "./GlassCard";
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
    BANK:   "Bank",
    MANUAL: "Added by you",
};

function DailyRecap() {

    const [recap,   setRecap]   = useState(null);
    const [loading, setLoading] = useState(true);
    const [failed,  setFailed]  = useState(false);

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

    if (loading) {
        return (
            <GlassCard className="p-8 mb-8 border border-white/10 bg-white/[0.03]">
                <div className="h-7 w-2/3 rounded-lg bg-white/5 animate-pulse" />
                <div className="h-4 w-1/2 rounded-lg bg-white/5 animate-pulse mt-4" />
            </GlassCard>
        );
    }

    if (failed || !recap) {
        return (
            <GlassCard className="p-8 mb-8 border border-white/10 bg-white/[0.03]">
                <p className="text-zinc-400">
                    Your recap could not be loaded just now. Your transactions are unaffected.
                </p>
            </GlassCard>
        );
    }

    const groups = groupByDay(recap.charges);

    return (
        <>
            <GlassCard className="p-8 mb-6 border border-white/10 bg-white/[0.03] backdrop-blur-xl">

                <div className="flex items-center gap-2 mb-5">
                    <Sparkles size={14} className="text-cyan-400" />
                    <span className="text-[11px] font-bold tracking-[0.12em] text-zinc-500">
                        {recap.firstVisit ? "YOUR FIRST LOOK" : "SINCE YOU LAST LOOKED"}
                    </span>
                </div>

                <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight leading-tight">
                    {recap.headline}
                </h1>

                {recap.lines?.length > 0 && (
                    <div className="mt-5 space-y-2">
                        {recap.lines.map((line, i) => (
                            <p key={i} className="text-[15px] text-zinc-300 leading-relaxed">
                                {line}
                            </p>
                        ))}
                    </div>
                )}

                {recap.chargeCount > 0 && (
                    <p className="mt-6 text-xs text-zinc-500">
                        {recap.chargeCount}
                        {recap.chargeCount === 1 ? " charge" : " charges"}
                        {" across every connected account"}
                    </p>
                )}

            </GlassCard>

            {recap.upcoming?.length > 0 && (
                <GlassCard className="p-6 mb-6 border border-amber-500/15 bg-amber-500/[0.03]">

                    <div className="flex items-center gap-2 mb-4">
                        <Clock size={14} className="text-amber-400" />
                        <span className="text-[11px] font-bold tracking-[0.12em] text-amber-400/80">
                            LANDING THIS WEEK
                        </span>
                    </div>

                    <div className="space-y-2.5">
                        {recap.upcoming.map((charge, i) => (
                            <div key={i} className="flex items-center justify-between gap-3">
                                <span className="text-sm text-zinc-300 truncate">
                                    {charge.merchant}
                                </span>
                                <span className="text-sm font-bold text-white shrink-0">
                                    {inr(charge.amount)}
                                </span>
                            </div>
                        ))}
                    </div>

                </GlassCard>
            )}

            {groups.length > 0 && (
                <GlassCard className="p-6 mb-8 border border-white/10 bg-white/[0.03]">

                    {groups.map((group) => (
                        <div key={group.label} className="mb-5 last:mb-0">

                            <div className="text-[11px] font-bold tracking-[0.1em] text-zinc-500 mb-2.5">
                                {group.label.toUpperCase()}
                            </div>

                            <div className="space-y-1">
                                {group.charges.map((charge, i) => (
                                    <div
                                        key={i}
                                        className="
                                            flex items-center justify-between gap-3
                                            py-2.5 px-3 -mx-3 rounded-lg
                                            hover:bg-white/[0.03] transition-colors
                                        "
                                    >
                                        <div className="min-w-0">
                                            <div className="text-sm text-white truncate">
                                                {charge.merchant}
                                            </div>
                                            <div className="text-[11px] text-zinc-500 mt-0.5">
                                                {charge.category || "Uncategorised"}
                                                {SOURCE_LABEL[charge.source] && (
                                                    <> · {SOURCE_LABEL[charge.source]}</>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-sm font-bold text-white shrink-0">
                                            {inr(charge.amount)}
                                        </div>
                                    </div>
                                ))}
                            </div>

                        </div>
                    ))}

                </GlassCard>
            )}

            {recap.chargeCount === 0 && (
                <GlassCard className="p-8 mb-8 border border-white/10 bg-white/[0.02] text-center">
                    <ArrowRight size={18} className="text-zinc-600 mx-auto mb-3" />
                    <p className="text-sm text-zinc-400">
                        Nothing to review. Your accounts are connected and quiet.
                    </p>
                </GlassCard>
            )}
        </>
    );
}

export default DailyRecap;
