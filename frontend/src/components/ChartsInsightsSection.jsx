import ExpensePieChart from "../charts/ExpensePieChart";
import GlassCard from "./GlassCard";

import {
    Brain,
    BarChart2
} from "lucide-react";

function ChartsInsightsSection({ chartData, insights }) {

    return (

        <div
            className="
                grid
                grid-cols-1
                xl:grid-cols-2
                gap-4
                mb-10
            "
        >

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
                        flex
                        items-center
                        gap-3
                        mb-5
                    "
                >

                    <div
                        className="
                            w-9
                            h-9
                            rounded-lg
                            flex
                            items-center
                            justify-center
                            bg-cyan-500/10
                            border
                            border-cyan-500/20
                        "
                    >
                        <BarChart2
                            size={16}
                            className="text-cyan-400"
                        />
                    </div>

                    <div>

                        <div
                            className="
                                text-[10px]
                                font-bold
                                tracking-[0.1em]
                                text-zinc-500
                            "
                        >
                            ANALYTICS
                        </div>

                        <h2
                            className="
                                text-base
                                font-bold
                            "
                        >
                            Financial Analytics
                        </h2>

                    </div>

                </div>

                <ExpensePieChart data={chartData} />

            </GlassCard>

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
                        flex
                        items-center
                        gap-3
                        mb-5
                    "
                >

                    <div
                        className="
                            w-9
                            h-9
                            rounded-lg
                            flex
                            items-center
                            justify-center
                            bg-purple-500/10
                            border
                            border-purple-500/20
                        "
                    >
                        <Brain
                            size={16}
                            className="text-purple-400"
                        />
                    </div>

                    <div>

                        <div
                            className="
                                text-[10px]
                                font-bold
                                tracking-[0.1em]
                                text-zinc-500
                            "
                        >
                            AI POWERED
                        </div>

                        <h2
                            className="
                                text-base
                                font-bold
                            "
                        >
                            AI Insights
                        </h2>

                    </div>

                </div>

                <div className="space-y-3">

                    {insights.map((insight, index) => (

                        <div
                            key={index}
                            className="
                                bg-purple-500/5
                                border
                                border-purple-500/10
                                border-l-[3px]
                                border-l-purple-400
                                rounded-xl
                                p-4
                                text-sm
                                text-zinc-300
                                leading-7
                            "
                        >
                            {insight}
                        </div>
                    ))}

                </div>

            </GlassCard>

        </div>
    );
}

export default ChartsInsightsSection;