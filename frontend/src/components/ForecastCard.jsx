import GlassCard from "./GlassCard";

import {
    TrendingUp,
    TrendingDown,
    Sparkles,
    ShieldCheck
} from "lucide-react";

import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip
} from "recharts";

function ForecastCard({

    forecast,
    monthlyHistory

}) {

    if (!forecast) return null;

    const visibleHistory =
        (monthlyHistory || []).slice(-3);

    const lastItem = visibleHistory[visibleHistory.length - 1];

    const nextMonthLabel = lastItem
        ? new Date(
              new Date(lastItem.month + "-01")
                  .setMonth(new Date(lastItem.month + "-01").getMonth() + 1)
          ).toLocaleString("en-US", { month: "short" })
        : new Date(
              new Date().setMonth(new Date().getMonth() + 1)
          ).toLocaleString("en-US", { month: "short" });

    const chartData = [
        ...visibleHistory.map(item => ({
            month: new Date(item.month + "-01").toLocaleString("en-US", { month: "short" }),
            amount: item.expense,
        })),
        {
            month: nextMonthLabel,
            amount: forecast?.predictedExpenses || 0,
        },
    ];

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

            {/* Header */}

            <div
                className="
                    absolute
                    -top-20
                    -right-20
                    w-52
                    h-52
                    rounded-full
                    bg-purple-500/10
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
                AI FORECAST
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
                            text-white
                        "
                    >
                        AI Forecast Simulator
                    </h2>

                    <p
                        className="
                            text-xs
                            text-zinc-500
                        "
                    >
                        XGBoost Powered
                    </p>

                </div>

            </div>

            {/* Hero Card */}

            <div
                className="
                    mb-6
                "
            >

                <div
                    className="
                        text-xs
                        tracking-wide
                        text-zinc-500
                        mb-2
                    "
                >
                    PREDICTED NEXT MONTH
                </div>

                <h1
                    className="
                        text-5xl
                        font-black
                        tracking-tight
                        text-white
                    "
                >
                    ₹{
                        forecast.predictedExpenses
                            ?.toLocaleString("en-IN")
                    }
                </h1>

                <p
                    className="
                        text-sm
                        text-zinc-500
                        mt-2
                    "
                >
                    AI estimated expense forecast
                </p>

            </div>

            {/* Stats */}

            <div
                className="
                    grid
                    grid-cols-2
                    gap-4
                    mb-6
                "
            >

                <div
                    className="
                        rounded-2xl
                        border
                        border-green-500/15
                        bg-green-500/[0.05]
                        p-4
                    "
                >

                    <div
                        className="
                            text-[10px]
                            tracking-widest
                            text-green-400
                            mb-2
                        "
                    >
                        PREDICTED SAVINGS
                    </div>

                    <h3
                        className="
                            text-xl
                            font-bold
                            text-green-400
                        "
                    >
                        ₹{
                            forecast.predictedSavings
                                ?.toLocaleString("en-IN")
                        }
                    </h3>

                </div>

                <div
                    className="
                        rounded-2xl
                        border
                        border-yellow-500/15
                        bg-yellow-500/[0.05]
                        p-4
                    "
                >

                    <div
                        className="
                            text-[10px]
                            tracking-widest
                            text-yellow-400
                            mb-2
                        "
                    >
                        EXPENSE GROWTH
                    </div>

                    <h3
                        className="
                            text-xl
                            font-bold
                            text-yellow-400
                        "
                    >
                        {forecast.expenseGrowth}%
                    </h3>

                </div>

            </div>

            {/* Forecast Chart */}

            <div className="
                rounded-2xl
                p-6
                mb-8
                border
                border-purple-500/20
                bg-zinc-900/40
            ">

                <div className="
                    flex
                    items-center
                    justify-between
                    mb-6
                ">

                    <h3 className="
                        text-2xl
                        font-bold
                    ">
                        Forecast Expense Trend
                    </h3>

                    <span className="
                        text-purple-400
                    ">
                        AI Projection
                    </span>

                </div>

                <div className="
                    h-[180px]
                ">

                    <ResponsiveContainer
                        width="100%"
                        height="100%"
                    >

                        <LineChart
                            data={chartData}
                            margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                        >

                            <XAxis
                                dataKey="month"
                            />

                            <YAxis
                                width={48}
                                tickFormatter={(value) => {
                                    if (value >= 100000) return "₹" + (value / 100000).toFixed(1) + "L";
                                    if (value >= 1000) return "₹" + (value / 1000).toFixed(0) + "k";
                                    return "₹" + value;
                                }}
                            />

                            <Tooltip />

                            <Line
                                type="monotone"
                                dataKey="amount"
                                stroke="#a855f7"
                                strokeWidth={4}
                            />

                        </LineChart>

                    </ResponsiveContainer>

                </div>

            </div>

            {/* Insight */}

            <div
                className="
                    rounded-2xl
                    border
                    border-purple-500/15
                    bg-purple-500/[0.05]
                    p-5
                "
            >

                <div
                    className="
                        text-xs
                        font-semibold
                        tracking-wide
                        text-purple-400
                        mb-2
                    "
                >
                    AI INSIGHT
                </div>

                <p
                    className="
                        text-sm
                        leading-7
                        text-zinc-300
                    "
                >
                    {forecast.insight}
                </p>

            </div>

        </GlassCard>
    );
}

export default ForecastCard;