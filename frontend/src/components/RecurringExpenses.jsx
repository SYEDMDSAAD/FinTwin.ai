import GlassCard from "./GlassCard";

import {
    RefreshCw
} from "lucide-react";

function RecurringExpenses({ recurringExpenses }) {

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
                    recurringExpenses.length > 0 && (

                        <div
                            className="
                                ml-auto
                                px-3
                                py-1
                                rounded-lg
                                text-xs
                                font-bold
                                bg-red-500/10
                                border
                                border-red-500/20
                                text-red-400
                            "
                        >
                            {recurringExpenses.length} subscriptions
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
                        (expense, index) => (

                            <div
                                key={index}
                                className="
                                    rounded-2xl
                                    border
                                    border-red-500/10
                                    bg-red-500/[0.04]
                                    p-5
                                    transition-all
                                    duration-300
                                    hover:bg-red-500/[0.08]
                                    hover:border-red-500/20
                                "
                            >

                                <h3 className="
                                    text-base
                                    font-bold
                                    text-white
                                    mb-2
                                ">
                                    {expense.merchant}
                                </h3>

                                <p className="
                                    text-red-400
                                    text-2xl
                                    font-black
                                    tracking-tight
                                ">
                                    ₹{
                                        expense.amount
                                            .toLocaleString("en-IN")
                                    }
                                </p>

                                <p
                                    className="
                                        text-xs
                                        text-zinc-500
                                        mt-3
                                    "
                                >
                                    Repeated
                                    {" "}
                                    <span className="
                                        text-zinc-200
                                        font-bold
                                    ">
                                        {
                                            expense.occurrences
                                        }
                                    </span>
                                    {" "}
                                    ×
                                </p>

                            </div>
                        )
                    )}

                </div>

            )}

        </GlassCard>
    );
}

export default RecurringExpenses;