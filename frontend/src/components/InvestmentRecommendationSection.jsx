import GlassCard from "./GlassCard";

import {

    PieChart,
    Pie,
    Cell,
    Tooltip,
    ResponsiveContainer

} from "recharts";

function InvestmentRecommendationSection({

    recommendation

}) {

    if (!recommendation) return null;

    const COLORS = [
        "#a78bfa",
        "#22d3ee",
        "#4ade80",
        "#fbbf24",
        "#f87171",
        "#f472b6"
    ];

    return (

        <div className="mb-10">

            <div className="flex items-center gap-3 mb-6">

                <div
                    className="
                        w-10
                        h-10
                        rounded-xl
                        flex
                        items-center
                        justify-center
                        bg-purple-500/10
                        border
                        border-purple-500/20
                    "
                >
                    📈
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
                        AI POWERED
                    </div>

                    <h2
                        className="
                            text-lg
                            font-bold
                        "
                    >
                        Investment Advisor
                    </h2>

                </div>

            </div>

            {/* Top Cards */}

            <div className="
                grid
                grid-cols-1
                md:grid-cols-2
                xl:grid-cols-4
                gap-4
                mb-6
            ">

                <GlassCard
                    className="
                        relative
                        overflow-hidden
                        p-5
                        border
                        border-white/10
                        bg-white/[0.03]
                        backdrop-blur-xl
                    "
                >

                    <div
                        className="
                            absolute
                            inset-x-0
                            top-0
                            h-px
                            bg-gradient-to-r
                            from-transparent
                            via-white/20
                            to-transparent
                        "
                    />

                    <p className="
                        text-zinc-400
                        mb-2
                    ">
                        Risk Profile
                    </p>

                    <h3 className={`
                        text-2xl
                        font-bold

                        ${
                            recommendation.riskProfile
                                .toLowerCase()
                                .includes("aggressive")

                            ? "text-red-400"

                            : recommendation.riskProfile
                                .toLowerCase()
                                .includes("moderate")

                            ? "text-yellow-400"

                            : "text-green-400"
                        }
                    `}>
                        {recommendation.riskProfile}
                    </h3>

                </GlassCard>

                <GlassCard
                    className="
                        relative
                        overflow-hidden
                        p-5
                        border
                        border-white/10
                        bg-white/[0.03]
                        backdrop-blur-xl
                    "
                >

                    <div
                        className="
                            absolute
                            inset-x-0
                            top-0
                            h-px
                            bg-gradient-to-r
                            from-transparent
                            via-white/20
                            to-transparent
                        "
                    />

                    <p className="
                        text-zinc-400
                        mb-2
                    ">
                        Expected Return
                    </p>

                    <h3 className="
                        text-2xl
                        font-bold
                        text-green-400
                    ">
                        {
                            recommendation.expectedReturn
                        }
                    </h3>

                </GlassCard>

                <GlassCard
                    className="
                        relative
                        overflow-hidden
                        p-5
                        border
                        border-white/10
                        bg-white/[0.03]
                        backdrop-blur-xl
                    "
                >

                    <div
                        className="
                            absolute
                            inset-x-0
                            top-0
                            h-px
                            bg-gradient-to-r
                            from-transparent
                            via-white/20
                            to-transparent
                        "
                    />

                    <p className="
                        text-zinc-400
                        mb-2
                    ">
                        Horizon
                    </p>

                    <h3 className="
                        text-xl
                        font-bold
                        text-blue-400
                    ">
                        {
                            recommendation.investmentHorizon
                        }
                    </h3>

                </GlassCard>

                <GlassCard
                    className="
                        relative
                        overflow-hidden
                        p-5
                        border
                        border-white/10
                        bg-white/[0.03]
                        backdrop-blur-xl
                    "
                >

                    <div
                        className="
                            absolute
                            inset-x-0
                            top-0
                            h-px
                            bg-gradient-to-r
                            from-transparent
                            via-white/20
                            to-transparent
                        "
                    />

                    <p className="
                        text-zinc-400
                        mb-2
                    ">
                        Portfolio Score
                    </p>

                    <div>

                        <h3 className="
                            text-2xl
                            font-bold
                            text-yellow-400
                        ">
                            {recommendation.portfolioScore}/100
                        </h3>

                        <p className="
                            text-zinc-500
                            mt-2
                        ">
                            {
                                recommendation.portfolioScore >= 85

                                ? "Excellent"

                                : recommendation.portfolioScore >= 70

                                ? "Good"

                                : recommendation.portfolioScore >= 50

                                ? "Average"

                                : "Needs Improvement"
                            }
                        </p>

                    </div>

                </GlassCard>

            </div>

            {/* Investable Amount */}

            <GlassCard className="
                relative
                overflow-hidden
                p-6
                mb-6
                border
                border-white/10
                bg-white/[0.03]
                backdrop-blur-xl
            ">

                <p className="
                    text-zinc-400
                    mb-2
                ">
                    Monthly Investable Amount
                </p>

                <h1 className="
                    text-4xl
                    font-extrabold
                    text-purple-400
                ">
                    ₹{
                        recommendation
                        .monthlyInvestableAmount
                        ?.toLocaleString("en-IN")
                    }
                </h1>

            </GlassCard>

            <div
                className="
                    grid
                    xl:grid-cols-[1fr_1.3fr]
                    gap-4
                    mb-6
                "
            >

                {/* Pie Chart */}

                <GlassCard
                    className="
                        relative
                        overflow-hidden
                        p-6
                        border
                        border-white/10
                        bg-white/[0.03]
                        backdrop-blur-xl
                    "
                >

                    <div
                        className="
                            text-[10px]
                            font-bold
                            tracking-[0.1em]
                            text-zinc-500
                            mb-4
                        "
                    >
                        PORTFOLIO ALLOCATION
                    </div>

                    <ResponsiveContainer
                        width="100%"
                        height={260}
                    >

                        <PieChart>

                            <Pie
                                data={recommendation.recommendations}
                                dataKey="allocation"
                                nameKey="asset"
                                innerRadius={50}
                                outerRadius={100}
                                labelLine={false}
                                label={({ percent }) =>
                                    `${(percent * 100).toFixed(0)}%`
                                }
                            >

                                {recommendation.recommendations.map(
                                    (_, index) => (
                                        <Cell
                                            key={index}
                                            fill={
                                                COLORS[
                                                    index %
                                                    COLORS.length
                                                ]
                                            }
                                        />
                                    )
                                )}

                            </Pie>

                            <Tooltip />

                        </PieChart>

                    </ResponsiveContainer>

                </GlassCard>

                {/* Allocation Cards */}

                <div
                    className="
                        flex
                        flex-col
                        gap-3
                    "
                >

                    {recommendation.recommendations.map(
                        (item, index) => (

                            <div
                                key={index}
                                className="
                                    rounded-xl
                                    p-4
                                "
                                style={{
                                    border:
                                        `1px solid ${
                                            COLORS[
                                                index %
                                                COLORS.length
                                            ]
                                        }25`,
                                    borderLeft:
                                        `3px solid ${
                                            COLORS[
                                                index %
                                                COLORS.length
                                            ]
                                        }`,
                                    background:
                                        `${COLORS[
                                            index %
                                            COLORS.length
                                        ]}10`
                                }}
                            >

                                <div
                                    className="
                                        flex
                                        justify-between
                                        items-center
                                        mb-2
                                    "
                                >

                                    <span
                                        className="
                                            text-sm
                                            font-bold
                                        "
                                    >
                                        {item.asset}
                                    </span>

                                    <span
                                        className="
                                            text-xs
                                            font-bold
                                        "
                                        style={{
                                            color:
                                                COLORS[
                                                    index %
                                                    COLORS.length
                                                ]
                                        }}
                                    >
                                        {item.allocation}%
                                    </span>

                                </div>

                                <p
                                    className="
                                        text-lg
                                        font-extrabold
                                        mb-1
                                    "
                                >
                                    ₹{item.amount?.toLocaleString("en-IN")}
                                </p>

                                <p
                                    className="
                                        text-xs
                                        text-zinc-500
                                    "
                                >
                                    {item.reason}
                                </p>

                            </div>
                        )
                    )}

                </div>

            </div>

            {/* AI Summary */}

            <GlassCard
                className="
                    relative
                    overflow-hidden
                    p-6
                    border
                    border-white/10
                    bg-white/[0.03]
                    backdrop-blur-xl
                "
            >

                <div
                    className="
                        absolute
                        inset-x-0
                        top-0
                        h-px
                        bg-gradient-to-r
                        from-transparent
                        via-white/20
                        to-transparent
                    "
                />

                <div
                    className="
                        text-[10px]
                        font-bold
                        tracking-[0.1em]
                        text-purple-400/60
                        mb-3
                    "
                >
                    AI ANALYSIS
                </div>

                <p
                    className="
                        text-sm
                        text-zinc-300
                        leading-7
                    "
                >
                    {
                        recommendation.summary
                    }
                </p>

            </GlassCard>

        </div>
    );
}

export default InvestmentRecommendationSection;