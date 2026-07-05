import GlassCard from "./GlassCard";

import { Sparkles } from "lucide-react";

function CategoryForecastCard({
    categoryForecast
}) {

    if (
        !categoryForecast ||
        categoryForecast.length === 0
    ) {
        return null;
    }

    const COLORS = [
        "#8B5CF6",
        "#22C55E",
        "#F59E0B",
        "#EF4444",
        "#06B6D4",
        "#EC4899"
    ];

    const total =
        categoryForecast.reduce(
            (sum, item) =>
                sum + item.predictedAmount,
            0
        );

    return (

        <GlassCard
            className="
                relative
                overflow-hidden
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
                    absolute
                    -top-16
                    -right-16
                    w-40
                    h-40
                    rounded-full
                    bg-cyan-500/10
                    blur-3xl
                "
            />

            <div
                className="
                    text-[11px]
                    font-bold
                    tracking-[0.12em]
                    text-zinc-500
                    mb-5
                "
            >
                AI CATEGORY FORECAST
            </div>

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
                        bg-gradient-to-r
                        from-purple-500/30
                        to-cyan-500/20
                        border
                        border-purple-500/20
                    "
                >
                    <Sparkles size={18} />
                </div>

                <div>

                    <h2
                        className="
                            text-lg
                            font-bold
                        "
                    >
                        Spending Distribution
                    </h2>

                    <p
                        className="
                            text-xs
                            text-zinc-500
                        "
                    >
                        AI predicted category breakdown
                    </p>

                </div>

            </div>

                <div
                    className="
                        space-y-4
                    "
                >

                    {[...categoryForecast]
                        .sort(
                            (a, b) =>
                                b.predictedAmount -
                                a.predictedAmount
                        )
                        .map(
                        (
                            item,
                            index
                        ) => {

                            const percentage =
                                (
                                    item.predictedAmount /
                                    total
                                ) * 100;

                            return (

                                <div
                                    key={index}
                                    className="
                                    rounded-2xl
                                    border
                                    border-white/10
                                    bg-white/[0.02]
                                    p-4
                                "
                                >

                                    <div
                                        className="
                                            flex
                                            justify-between
                                            items-center
                                            mb-2
                                        "
                                    >

                                        <div
                                            className="
                                                flex
                                                items-center
                                                gap-3
                                            "
                                        >

                                            <div
                                                className="
                                                    w-4
                                                    h-4
                                                    rounded-full
                                                "
                                                style={{
                                                    background:
                                                        COLORS[
                                                            index %
                                                            COLORS.length
                                                        ]
                                                }}
                                            />

                                            <span
                                                className="
                                                    text-sm
                                                    font-medium
                                                    text-white
                                                "
                                            >
                                                {item.category}
                                            </span>

                                        </div>

                                        <span
                                            className="
                                                text-sm
                                                font-bold
                                                text-white
                                            "
                                        >
                                            ₹{item.predictedAmount.toLocaleString("en-IN")}
                                        </span>

                                    </div>

                                    <div
                                        className="
                                            w-full
                                            h-1.5
                                            rounded-full
                                            bg-white/5
                                            overflow-hidden
                                        "
                                    >

                                        <div
                                            className="
                                                h-full
                                                rounded-full
                                                transition-all
                                                duration-700
                                            "
                                            style={{
                                                width:
                                                    `${percentage}%`,
                                                background:
                                                    COLORS[
                                                        index %
                                                        COLORS.length
                                                    ]
                                            }}
                                        />

                                    </div>

                                    <div
                                        className="
                                            flex
                                            justify-between
                                            text-[11px]
                                            text-zinc-500
                                            mt-2
                                        "
                                    >

                                        <span>
                                            {percentage.toFixed(1)}%
                                        </span>

                                        <span>
                                            forecast share
                                        </span>

                                    </div>

                                </div>

                            );
                        }
                    )}

                </div>

        </GlassCard>

    );
}

export default CategoryForecastCard;