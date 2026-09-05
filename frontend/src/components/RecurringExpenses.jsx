import GlassCard from "./GlassCard";

import {
    RefreshCw
} from "lucide-react";

const inr = (value) =>
    "₹" + Math.round(value || 0).toLocaleString("en-IN");

// "in 3 days" reads better than a date when a charge is imminent, which is
// exactly when someone still has time to cancel it.
export function describeNextCharge(nextChargeDate) {

    if (!nextChargeDate) return null;

    const next  = new Date(nextChargeDate + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (Number.isNaN(next.getTime())) return null;

    const days = Math.round((next - today) / 86400000);

    if (days <= 0) return "due now";
    if (days === 1) return "tomorrow";
    if (days <= 14) return `in ${days} days`;

    return next.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function RecurringExpenses({ recurringExpenses = [] }) {

    const active = recurringExpenses.filter((e) => e.active !== false);

    // What these cost over the next twelve months if nothing changes — the
    // number that makes a ₹199 subscription feel like a decision.
    const annualTotal = active.reduce(
        (sum, e) => sum + (e.annualisedCost || 0),
        0
    );

    return (

        <GlassCard
            className="
                p-7
                mb-8
                border
                border-white/10
                bg-white/[0.03]
                backdrop-blur-xl
            "
        >

            <div
                className="
                    flex
                    items-center
                    gap-3
                    mb-6
                "
            >

                <div
                    className="
                        w-10
                        h-10
                        rounded-xl
                        flex
                        items-center
                        justify-center
                        bg-red-500/10
                        border
                        border-red-500/20
                    "
                >
                    <RefreshCw
                        size={18}
                        className="text-red-400"
                    />
                </div>

                <div>

                    <div
                        className="
                            text-[11px]
                            font-bold
                            tracking-[0.12em]
                            text-zinc-500
                        "
                    >
                        AI DETECTED
                    </div>

                    <h2
                        className="
                            text-lg
                            font-bold
                            text-white
                            mt-1
                        "
                    >
                        Recurring Expenses
                    </h2>

                </div>

                {
                    active.length > 0 && (

                        <div
                            className="
                                ml-auto
                                text-right
                            "
                        >

                            <div
                                className="
                                    text-lg
                                    font-black
                                    text-red-400
                                    leading-none
                                "
                            >
                                {inr(annualTotal)}
                            </div>

                            <div
                                className="
                                    text-[11px]
                                    text-zinc-500
                                    mt-1
                                "
                            >
                                a year across {active.length}
                                {" "}
                                {active.length === 1 ? "charge" : "charges"}
                            </div>

                        </div>

                    )
                }

            </div>

            {recurringExpenses.length === 0 ? (

                <div
                    className="
                        rounded-xl
                        border
                        border-green-500/20
                        bg-green-500/5
                        p-5
                        text-green-400
                        font-medium
                    "
                >
                    ✓ No recurring expenses detected
                </div>

            ) : (

                <div className="
                    grid
                    grid-cols-1
                    md:grid-cols-2
                    xl:grid-cols-4
                    gap-3
                ">

                    {recurringExpenses.map(
                        (expense, index) => {

                            const lapsed = expense.active === false;
                            const due    = describeNextCharge(expense.nextChargeDate);

                            return (

                                <div
                                    key={index}
                                    className={`
                                        rounded-2xl
                                        border
                                        p-5
                                        transition-all
                                        duration-300
                                        ${lapsed
                                            ? "border-white/10 bg-white/[0.02] opacity-60"
                                            : "border-red-500/10 bg-red-500/[0.04] hover:bg-red-500/[0.08] hover:border-red-500/20"}
                                    `}
                                >

                                    <div
                                        className="
                                            flex
                                            items-start
                                            justify-between
                                            gap-2
                                            mb-2
                                        "
                                    >

                                        <h3 className="
                                            text-base
                                            font-bold
                                            text-white
                                            break-words
                                        ">
                                            {expense.merchant}
                                        </h3>

                                        {expense.cadence && (
                                            <span className="
                                                shrink-0
                                                px-2
                                                py-0.5
                                                rounded-md
                                                text-[10px]
                                                font-bold
                                                tracking-wide
                                                bg-white/5
                                                text-zinc-400
                                            ">
                                                {expense.cadence.toUpperCase()}
                                            </span>
                                        )}

                                    </div>

                                    <p className="
                                        text-red-400
                                        text-2xl
                                        font-black
                                        tracking-tight
                                    ">
                                        {inr(expense.amount)}
                                        {expense.amountVaries && (
                                            <span className="
                                                text-xs
                                                font-medium
                                                text-zinc-500
                                                ml-1.5
                                            ">
                                                approx
                                            </span>
                                        )}
                                    </p>

                                    {expense.annualisedCost > 0 && (
                                        <p className="
                                            text-xs
                                            text-zinc-400
                                            mt-1
                                        ">
                                            {inr(expense.annualisedCost)} a year
                                        </p>
                                    )}

                                    <p
                                        className="
                                            text-xs
                                            text-zinc-500
                                            mt-3
                                        "
                                    >
                                        {lapsed ? (
                                            <>
                                                No charge in a while — possibly cancelled
                                            </>
                                        ) : (
                                            <>
                                                Next charge
                                                {" "}
                                                <span className="
                                                    text-zinc-200
                                                    font-bold
                                                ">
                                                    {due || "—"}
                                                </span>
                                                {" · "}
                                                {expense.occurrences}
                                                {" charges so far"}
                                            </>
                                        )}
                                    </p>

                                </div>
                            );
                        }
                    )}

                </div>

            )}

        </GlassCard>
    );
}

export default RecurringExpenses;
