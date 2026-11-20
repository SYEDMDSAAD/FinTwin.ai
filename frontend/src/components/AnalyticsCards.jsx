import { useState, useEffect } from "react";
import { rupees, percent, dayRange, changeTone, NEUTRAL } from "../utils/money";

// Counts up (or down) to the value; the sign stays in front of the ₹
function AnimatedNumber({
    value,
    duration = 1200
}) {

    const [display, setDisplay] = useState(0);

    useEffect(() => {

        const target = Number(value) || 0;
        const steps = Math.max(1, Math.round(duration / 16));
        let step = 0;

        const timer = setInterval(() => {

            step += 1;

            if (step >= steps) {

                setDisplay(target);
                clearInterval(timer);

            } else {

                setDisplay((target * step) / steps);

            }

        }, 16);

        return () => clearInterval(timer);

    }, [value, duration]);

    return <span>{rupees(display)}</span>;
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
    savingsTrend,
    compared = {}
}) {

    // What the change is measured against: the same days of last month
    const range = dayRange(compared.from, compared.to);
    const against = range ? `vs ${range}` : "vs last month";

    // The arrow follows the change itself; its colour says whether that's
    // good: more income or savings is, more spending isn't.
    const change = (trend, before, goodWhenUp) => {
        if (before === 0) {
            return {
                trend: "—",
                icon: null,
                tone: NEUTRAL,
                title: range ? `Nothing on record for ${range} to compare with` : "Nothing to compare with yet"
            };
        }
        const n = Number(trend) || 0;
        return {
            trend: percent(n, { plus: true }),
            icon: n < 0 ? <ArrowDown size={12} /> : n > 0 ? <ArrowUp size={12} /> : null,
            tone: changeTone(n, goodWhenUp),
            title: before == null ? "" : `${rupees(before)} on ${range || "last month"}`
        };
    };

    const cards = [
        {
            label: "Total Income",
            value: income,
            color: "#4ade80",
            ...change(incomeTrend, compared.income, true),
            sub: `This month · ${against}`
        },

        {
            label: "Total Expenses",
            value: Math.abs(expenses),
            color: "#f87171",
            ...change(expenseTrend, compared.expenses, false),
            sub: `This month · ${against}`
        },

        {
            label: "Net Savings",
            value: savings,
            color: "#22d3ee",
            ...change(savingsTrend, compared.savings, true),
            sub: `This month · ${against}`
        },

        {
            label: "Predicted Expense",
            value: prediction || 0,
            color: "#a78bfa",
            trend: "AI Forecast",
            icon: <Sparkles size={12} />,
            tone: "#a78bfa",
            title: "",
            sub: "Next month"
        }
    ];

    return (

        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="
                grid
                grid-cols-2
                xl:grid-cols-4
                gap-3
                sm:gap-4
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
                        p-4
                        sm:p-5
                        md:p-6
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
                        mb-4
                        sm:mb-5
                    ">

                        <span
                            className="
                                text-[10px]
                                sm:text-[11px]
                                uppercase
                                tracking-wide
                                sm:tracking-widest
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
                                px-1.5
                                py-0.5
                                sm:px-2
                                sm:py-1
                                rounded-md
                                text-[9px]
                                sm:text-[10px]
                                font-bold
                                shrink-0
                            "
                            style={{
                                color: card.tone,
                                backgroundColor: `${card.tone}18`
                            }}
                            title={card.title || undefined}
                            data-testid={`trend-${card.label}`}
                        >
                            {card.icon}
                            {card.trend}
                        </div>

                    </div>

                    <h2
                        className="
                            text-xl
                            sm:text-2xl
                            md:text-3xl
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