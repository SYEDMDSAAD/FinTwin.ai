import {
    Hexagon
} from "lucide-react";

function SpendingHeatmap({ transactions }) {

    // =========================
    // Category Totals
    // =========================

    const categoryTotals = {};

    transactions.forEach((t) => {

        // Only expenses

        if (t.amount < 0) {

            // Ignore invalid category

            const category =
                t.category || "Other";

            categoryTotals[category] =

                (categoryTotals[category] || 0)

                + Math.abs(t.amount);
        }
    });

    // =========================
    // Max Value
    // =========================

    const max = Math.max(

        ...Object.values(categoryTotals),

        1
    );

    return (

        <div
            className="
                p-7
                mb-8
                rounded-2xl
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
                        bg-cyan-500/10
                        border
                        border-cyan-500/20
                    "
                >
                    <Hexagon
                        size={18}
                        className="text-cyan-400"
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
                        ANALYTICS
                    </div>

                    <h2
                        className="
                            text-lg
                            font-bold
                            text-white
                            mt-1
                        "
                    >
                        Spending Heatmap
                    </h2>

                </div>

                <div
                    className="
                        ml-auto
                        text-xs
                        text-zinc-500
                    "
                >
                    Expense intensity by category
                </div>

            </div>

            {/* Heatmap Grid */}

            <div className="
                grid
                grid-cols-1
                sm:grid-cols-2
                lg:grid-cols-3
                xl:grid-cols-4
                gap-3
            ">

                {Object.entries(categoryTotals)

                    .sort((a, b) => b[1] - a[1])

                    .map(([category, total]) => {

                        // =========================
                        // Opacity Control
                        // =========================

                        const intensity =
                            total / max;

                        return (

                            <div
                                key={category}
                                className="
                                    relative
                                    overflow-hidden
                                    rounded-xl
                                    border
                                    border-white/10
                                    p-5
                                    transition-all
                                    duration-300
                                    hover:-translate-y-1
                                    hover:border-white/20
                                "
                                style={{
                                    background: `rgba(167,139,250,${
                                        0.08 + intensity * 0.18
                                    })`
                                }}
                            >

                                <div
                                    className="
                                        absolute
                                        top-0
                                        left-0
                                        right-0
                                        h-[2px]
                                        bg-purple-400
                                    "
                                    style={{
                                        opacity:
                                            intensity * 0.8 + 0.2
                                    }}
                                />

                                {/* Category */}

                                <h3
                                    className="
                                        text-xs
                                        font-bold
                                        tracking-widest
                                        uppercase
                                        text-zinc-400
                                        mb-3
                                    "
                                >
                                    {category}
                                </h3>

                                {/* Amount */}

                                <p
                                    className="
                                        text-xl
                                        font-black
                                        text-white
                                        tabular-nums
                                    "
                                >

                                    ₹{
                                        total
                                            .toLocaleString()
                                    }

                                </p>

                                {/* Small Label */}

                                <div
                                    className="
                                        mt-3
                                        h-1
                                        bg-white/10
                                        rounded-full
                                        overflow-hidden
                                    "
                                >
                                    <div
                                        className="
                                            h-full
                                            bg-purple-400
                                            rounded-full
                                        "
                                        style={{
                                            width: `${intensity * 100}%`
                                        }}
                                    />
                                </div>

                            </div>
                        );
                    })}

            </div>

        </div>
    );
}

export default SpendingHeatmap;