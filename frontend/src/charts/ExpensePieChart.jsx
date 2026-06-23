import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    ResponsiveContainer,
    Legend
} from "recharts";

const COLORS = [

    "#22c55e",
    "#ef4444",
    "#3b82f6",
    "#eab308",
    "#a855f7"

];

function ExpensePieChart({ data }) {

    return (

        <div
            className="
                relative
                overflow-hidden
                p-6
                rounded-2xl
                border
                border-white/10
                bg-white/[0.03]
                backdrop-blur-xl
                transition-all
                duration-300
                hover:border-white/20
                hover:bg-white/[0.05]
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
                    $
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
                        "
                    >
                        Expense Breakdown
                    </h2>

                </div>

            </div>

            <div className="h-[320px]">
                <ResponsiveContainer
                    width="100%"
                    height="100%"
                >

                <PieChart>

                    <Pie
                        data={data}
                        dataKey="value"
                        cx="50%"
                        cy="50%"
                        outerRadius={110}
                        innerRadius={78}
                        paddingAngle={2}
                        labelLine={false}
                        label={({ name, percent }) =>
                            `${name} ${(percent * 100).toFixed(0)}%`
                        }
                    >

                        {data.map((entry, index) => (

                            <Cell
                                key={index}
                                fill={
                                    COLORS[
                                        index %
                                        COLORS.length
                                    ]
                                }
                            />

                        ))}

                    </Pie>

                    <Tooltip
                        contentStyle={{
                            backgroundColor: "#18181b",
                            border:
                                "1px solid #3f3f46",
                            borderRadius: "12px",
                            backdropFilter: "blur(12px)",
                            color: "#fff"
                        }}
                    />

                </PieChart>

            </ResponsiveContainer>
        </div>    

            <div
                className="
                    grid
                    grid-cols-2
                    gap-2
                    mt-4
                "
            >

                {data.map((item, index) => (

                    <div
                        key={item.name}
                        className="
                            flex
                            items-center
                            gap-2
                            text-xs
                            text-zinc-400
                        "
                    >

                        <div
                            className="
                                w-2.5
                                h-2.5
                                rounded-full
                            "
                            style={{
                                background:
                                    COLORS[index % COLORS.length]
                            }}
                        />

                        {item.name}

                    </div>

                ))}

            </div>

        </div>
    );
}

export default ExpensePieChart;