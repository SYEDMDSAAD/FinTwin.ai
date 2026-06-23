import GlassCard from "./GlassCard";

function MonthlySummaryCard({ summary }) {

    if (!summary) return null;

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
                    text-15px
                    font-bold
                    tracking-[0.12em]
                    text-zinc-500
                    mb-5
                "
            >
                MONTHLY SUMMARY
            </div>

            {/* Top Metrics */}

            <div
                className="
                    grid
                    grid-cols-3
                    gap-4
                    mb-6
                "
            >

                <div className="text-center">

                    <h3
                        className="
                            text-xl
                            font-bold
                            text-green-400
                        "
                    >
                        ₹{(summary.income / 100000).toFixed(2)}L
                    </h3>

                    <p
                        className="
                            text-15px
                            text-zinc-500
                            mt-1
                        "
                    >
                        Income
                    </p>

                </div>

                <div className="text-center">

                    <h3
                        className="
                            text-xl
                            font-bold
                            text-red-400
                        "
                    >
                        ₹{(summary.expenses / 100000).toFixed(2)}L
                    </h3>

                    <p
                        className="
                            text-13px
                            text-zinc-500
                            mt-1
                        "
                    >
                        Expenses
                    </p>

                </div>

                <div className="text-center">

                    <h3
                        className="
                            text-xl
                            font-bold
                            text-cyan-400
                        "
                    >
                        ₹{(summary.savings / 100000).toFixed(2)}L
                    </h3>

                    <p
                        className="
                            text-15px
                            text-zinc-500
                            mt-1
                        "
                    >
                        Savings
                    </p>

                </div>

            </div>

            {/* Bottom Meta */}

            <div
                className="
                    mt-6
                    pt-5
                    border-t
                    border-white/5
                    grid
                    grid-cols-3
                    gap-8
                "
            >

                <div className="text-center">

                    <p
                        className="
                            text-[11px]
                            uppercase
                            tracking-wider
                            text-zinc-500
                            mb-2
                        "
                    >
                        Top Category
                    </p>

                    <p
                        className="
                            text-2xl
                            font-bold
                            text-white
                            mt-1
                        "
                    >
                        {summary.topCategory}
                    </p>

                </div>

                <div className="text-center">

                    <p
                        className="
                            text-[11px]
                            uppercase
                            tracking-wider
                            text-zinc-500
                            mb-2
                        "
                    >
                        Top Merchant
                    </p>

                    <p
                        className="
                            text-2xl
                            font-bold
                            text-white
                            mt-1
                        "
                    >
                        {summary.topMerchant}
                    </p>

                </div>

                <div className="text-center">

                    <p
                        className="
                            text-[11px]
                            uppercase
                            tracking-wider
                            text-zinc-500
                            mb-2
                        "
                    >
                        Transactions
                    </p>

                    <p
                        className="
                            text-2xl
                            font-bold
                            text-white
                            mt-1
                        "
                    >
                        {summary.transactionCount}
                    </p>

                </div>

            </div>

        </GlassCard>
    );
}

export default MonthlySummaryCard;