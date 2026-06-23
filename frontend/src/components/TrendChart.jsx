import {

    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Area,
    AreaChart

} from "recharts";

import GlassCard from "./GlassCard";

import {
    TrendingUp
} from "lucide-react";

function TrendChart({ transactions }) {

    // =========================
    // Last 10 Expense Transactions
    // =========================

    const chartData = Object.values(

        transactions

            .filter(t => t.amount < 0)

            .reduce((acc, t) => {

                const date = t.date;

                if (!acc[date]) {

                    acc[date] = {
                        originalDate: date,
                        spending: 0
                    };
                }

                acc[date].spending +=
                    Math.abs(t.amount);

                return acc;

            }, {})

    )

    .sort(
        (a, b) =>
            new Date(a.originalDate) -
            new Date(b.originalDate)
    )

    .slice(-10)

    .map(item => ({

        date: new Date(item.originalDate)
            .toLocaleDateString(
                "en-IN",
                {
                    day: "numeric",
                    month: "short"
                }
            ),

        spending: item.spending

    }));

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
                        bg-purple-500/10
                        border
                        border-purple-500/20
                    "
                >
                    <TrendingUp
                        size={18}
                        className="text-purple-400"
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
                        Spending Trend
                    </h2>

                </div>

                <div
                    className="
                        ml-auto
                        text-xs
                        text-zinc-500
                    "
                >
                    Last 10 transactions
                </div>

            </div>

            <div className="w-full h-[280px] min-w-0">

                <ResponsiveContainer
                    width="100%"
                    height="100%"
                >

                    <AreaChart data={chartData}>

                        <defs>

                            <linearGradient
                                id="colorSpend"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                            >

                                <stop
                                    offset="5%"
                                    stopColor="#a78bfa"
                                    stopOpacity={0.25}
                                />

                                <stop
                                    offset="95%"
                                    stopColor="#a855f7"
                                    stopOpacity={0}
                                />

                            </linearGradient>

                        </defs>

                        <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(255,255,255,0.04)"
                            vertical={false}
                        />

                        <XAxis
                            dataKey="date"
                            axisLine={false}
                            tickLine={false}
                            tick={{
                                fontSize: 11,
                                fill: "rgba(148,163,184,0.5)"
                            }}
                        />

                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v) =>
                                `₹${(v / 1000).toFixed(0)}k`
                            }
                            tick={{
                                fontSize: 11,
                                fill: "rgba(148,163,184,0.5)"
                            }}
                        />

                        <Tooltip
                            contentStyle={{
                                background: "#0e1018",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: "12px",
                                color: "#fff"
                            }}
                            formatter={(value) => [
                                `₹${Number(value).toLocaleString("en-IN")}`,
                                "Spending"
                            ]}
                        />

                        <Area
                            type="monotone"
                            dataKey="spending"
                            stroke="#a78bfa"
                            strokeWidth={2.5}
                            fillOpacity={1}
                            fill="url(#colorSpend)"
                            dot={{
                                r: 4,
                                fill: "#a78bfa",
                                strokeWidth: 0
                            }}

                            activeDot={{
                                r: 7,
                                fill: "#a78bfa",
                                strokeWidth: 0
                            }}
                        />

                    </AreaChart>

                </ResponsiveContainer>

            </div>

        </GlassCard>
    );
}

export default TrendChart;