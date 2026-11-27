import { useEffect, useState } from "react";
import { PiggyBank, ChevronRight } from "lucide-react";
import API from "../../services/api";
import { rupees } from "../../utils/money";
import { grow, twinExtra } from "../../utils/twin";
import { openFutureTwin } from "../../hooks/useOwnXirr";

/*
 * The invest pot (Phase 4): money that slipped out of spending this month,
 * the round-ups on last month's payments to the next ₹10 and what Spend
 * Guard kept by pausing, shown as a monthly SIP would grow. Wishlist items
 * past their 2-day wait are named: let one go and it joins the pot.
 * Same numbers and maths as Future Twin (GET /twin, utils/twin.js).
 * Nothing moves; it's a picture of a habit.
 */

export default function InvestPot({ className = "" }) {
    const [twin, setTwin] = useState(null);
    useEffect(() => {
        let alive = true;
        API.get("/twin").then((r) => { if (alive) setTwin(r.data); }).catch(() => {});
        return () => { alive = false; };
    }, []);

    if (!twin) return null;
    const pot = Math.round(twinExtra(twin));
    const wishes = Array.isArray(twin.wishlistReady) ? twin.wishlistReady : [];
    const wishTotal = wishes.reduce((t, w) => t + (w.amount || 0), 0);
    if (pot <= 0 && wishTotal <= 0) return null;
    const tenYears = Math.round(grow(0, pot, 10, 10));
    const ru = twin.roundUps;
    return (
        <button type="button" onClick={openFutureTwin} aria-label="Invest pot"
                className={`w-full text-left rounded-card bg-surface border border-line p-4 hover:bg-surface-sunken/50 transition-colors ${className}`}>
            <span className="flex items-start gap-3">
                <span className="shrink-0 w-10 h-10 rounded-full bg-good/10 text-good flex items-center justify-center">
                    <PiggyBank size={18} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-caption text-ink-3">Invest pot this month</span>
                    <span className="block text-heading text-ink num">{rupees(pot)}</span>
                    <span className="block text-small text-ink-3 mt-0.5">
                        {[ru?.amount > 0 && `${rupees(ru.amount)} in round-ups on ${ru.payments} payments`,
                          twin.pausedThisMonth > 0 && `${rupees(twin.pausedThisMonth)} kept by pausing`].filter(Boolean).join(" · ")}
                    </span>
                    {pot > 0 && (
                        <span className="block text-small text-ink mt-2">
                            Every month for 10 years at 10% a year: about <b className="num">{rupees(tenYears)}</b>.
                        </span>
                    )}
                    {wishTotal > 0 && (
                        <span className="block text-small text-ink-3 mt-1">
                            {wishes.length === 1 ? `${wishes[0].name} (${rupees(wishes[0].amount)}) is` : `${wishes.length} wishlist items (${rupees(wishTotal)}) are`} past
                            the 2-day wait. Let go, that joins the pot.
                        </span>
                    )}
                </span>
                <ChevronRight size={18} className="shrink-0 text-ink-3 mt-1" aria-hidden />
            </span>
        </button>
    );
}
