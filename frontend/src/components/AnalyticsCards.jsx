import { useState, useEffect } from "react";

function AnimatedNumber({
    value,
    prefix = "₹",
    duration = 1200
}) {

    const [display, setDisplay] = useState(0);

    useEffect(() => {

        let start = 0;

        const step =
            value / (duration / 16);

        const timer = setInterval(() => {

            start += step;

            if (start >= value) {

                setDisplay(value);
                clearInterval(timer);

            } else {

                setDisplay(Math.floor(start));

            }

        }, 16);

        return () => clearInterval(timer);

    }, [value, duration]);

    return (
        <span>
            {prefix}
            {Math.round(display).toLocaleString("en-IN")}
        </span>
    );
}

import { motion } from "framer-motion";
import {
    ArrowUp,
    ArrowDown,
    Sparkles
} from "lucide-react";

function AnalyticsCards({
    income,
    expenses,
    savings,
    prediction,
    incomeTrend,
    expenseTrend,
    savingsTrend
}) {

    const cards = [
        {
            label: "Total Income",
            value: income,
            color: "#4ade80",
            trend: `${incomeTrend > 0 ? "+" : ""}${incomeTrend}%`,
            icon: <ArrowUp size={12} />,
            sub: "vs last month"
        },

        {
            label: "Total Expenses",
            value: Math.abs(expenses),
            color: "#f87171",
            trend: `${expenseTrend > 0 ? "+" : ""}${expenseTrend}%`,
            icon: <ArrowDown size={12} />,
            sub: "vs last month"
        },

        {
            label: "Net Savings",
            value: savings,
            color: "#22d3ee",
            trend: `${savingsTrend > 0 ? "+" : ""}${savingsTrend}%`,
            icon: <ArrowUp size={12} />,
            sub: "vs last month"
        },

        {
            label: "Predicted Expense",
            value: prediction || 0,
            color: "#a78bfa",
            trend: "AI Forecast",
            icon: <Sparkles size={12} />,
            sub: "next month"
        }
    ];

    return (

        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="
                grid
                grid-cols-1
                md:grid-cols-2
                xl:grid-cols-4
                gap-4
                mb-8
            "
        >

            {cards.map((card, index) => (

                <div
                    key={card.label}
                    className="
                        relative
                        overflow-hidden
                        rounded-2xl
                        border
                        border-white/10
                        bg-white/[0.03]
                        backdrop-blur-xl
                        p-6
                        transition-all
                        duration-300
                        hover:-translate-y-1
                        hover:border-white/20
                        hover:bg-white/[0.05]
                    "
                >

                    {/* Top Glow */}

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

                    <div className="
                        flex
                        justify-between
                        items-start
                        mb-5
                    ">

                        <span
                            className="
                                text-[11px]
                                uppercase
                                tracking-widest
                                text-zinc-500
                                font-semibold
                            "
                        >
                            {card.label}
                        </span>

                        <div
                            className="
                                flex
                                items-center
                                gap-1
                                px-2
                                py-1
                                rounded-md
                                text-[10px]
                                font-bold
                            "
                            style={{
                                color: card.color,
                                backgroundColor: `${card.color}18`
                            }}
                        >
                            {card.icon}
                            {card.trend}
                        </div>

                    </div>

                    <h2
                        className="
                            text-3xl
                            font-bold
                            text-white
                            tracking-tight
                            tabular-nums
                        "
                    >
                        <AnimatedNumber
                            value={Math.round(Number(card.value) || 0)}
                            duration={1000 + index * 200}
                        />
                    </h2>

                    <p
                        className="
                            text-xs
                            text-zinc-500
                            mt-2
                        "
                    >
                        {card.sub}
                    </p>

                    <div
                        className="
                            absolute
                            bottom-0
                            left-0
                            right-0
                            h-[2px]
                        "
                        style={{
                            background: `linear-gradient(90deg, transparent, ${card.color}, transparent)`
                        }}
                    />

                </div>

            ))}

        </motion.div>
    );
}

export default AnalyticsCards;