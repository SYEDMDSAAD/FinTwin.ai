import GlassCard from "./GlassCard";

function TransactionsTable({ transactions }) {

    return (

        <GlassCard
            className="
                p-6
                border
                border-white/10
                bg-white/[0.03]
                backdrop-blur-xl
            "
        >

            {/* Header */}

            <div
                className="
                    flex
                    justify-between
                    items-center
                    mb-5
                "
            >

                <div>

                    <div
                        className="
                            text-[11px]
                            font-bold
                            tracking-[0.12em]
                            text-zinc-500
                        "
                    >
                        RECENT
                    </div>

                    <h2
                        className="
                            text-lg
                            font-bold
                            text-white
                            mt-1
                        "
                    >
                        Transactions
                    </h2>

                </div>

                <button
                    className="
                        px-3
                        py-1.5
                        rounded-lg
                        border
                        border-white/10
                        text-xs
                        text-zinc-400
                        hover:bg-white/[0.05]
                        transition
                    "
                >
                    View All →
                </button>

            </div>

            {/* Column Header */}

            <div
                className="
                    grid
                    grid-cols-[3fr_3fr_2.5fr_1fr]
                    px-4
                    mb-4
                "
            >

                <span className="
                    text-xs
                    font-semibold
                    tracking-[0.15em]
                    uppercase
                    text-zinc-500
                    text-left
                ">
                    Merchant
                </span>

                <span
                    className="
                        text-xs
                        font-semibold
                        tracking-[0.15em]
                        uppercase
                        text-zinc-500
                        text-left
                    "
                >
                    Category
                </span>

                <span
                    className="
                        text-xs
                        font-semibold
                        tracking-[0.15em]
                        uppercase
                        text-zinc-500
                        text-left
                    "
                >
                    Date
                </span>

                <span
                    className="
                        text-xs
                        font-semibold
                        tracking-[0.15em]
                        uppercase
                        text-zinc-500
                        text-right
                    "
                >
                    Amount
                </span>

            </div>

            <div className="space-y-1">

                {[...transactions]
                    .sort(
                        (a, b) =>
                            new Date(b.date) -
                            new Date(a.date)
                    )
                    .map((t) => (

                    <div
                        key={t.id}
                        className="
                            grid
                            grid-cols-[3fr_1fr_5.2fr_1fr]
                            items-center
                            px-4
                            py-4
                            rounded-xl
                            hover:bg-white/[0.03]
                            transition-all
                            duration-200
                        "
                    >

                        {/* Merchant */}

                        <div
                            className="
                                flex
                                items-center
                                gap-3
                                justify-self-start
                            "
                        >

                            <div
                                className={`
                                    w-8
                                    h-8
                                    rounded-lg
                                    flex
                                    items-center
                                    justify-center
                                    text-xs
                                    border

                                    ${
                                        t.amount > 0
                                        ? "bg-emerald-950 border-emerald-700/50 text-emerald-300"
                                        : "bg-rose-950 border-rose-700/50 text-rose-300"
                                    }
                                `}
                            >

                                {t.amount > 0 ? "↓" : "↑"}

                            </div>

                            <span
                                className="
                                    text-lg
                                    text-white
                                    font-medium
                                "
                            >
                                {t.merchant}
                            </span>

                        </div>

                        {/* Category */}

                        <span
                            className="
                                text-base
                                font-semibold
                                px-3
                                py-1.5
                                rounded-md
                                bg-purple-500/10
                                border
                                border-purple-500/20
                                text-purple-300
                                inline-flex
                                w-[140px]
                                justify-center
                                justify-self-center
                            "
                        >
                            {t.category}
                        </span>

                        {/* Date */}

                        <span
                            className="
                                text-base
                                text-zinc-500
                                justify-self-center
                                tabular-nums
                            "
                        >
                            {t.date}
                        </span>

                        {/* Amount */}

                        <span
                            className={`
                                text-lg
                                font-bold
                                tabular-nums
                                justify-self-end

                                ${
                                    t.amount > 0
                                    ? "text-green-400"
                                    : "text-red-400"
                                }
                            `}
                        >

                            {t.amount > 0 ? "+" : "-"}

                            ₹

                            {Math.abs(t.amount)
                                .toLocaleString("en-IN")}

                        </span>

                    </div>

                ))}

            </div>

        </GlassCard>
    );
}

export default TransactionsTable;