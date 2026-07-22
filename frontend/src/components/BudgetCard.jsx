import { useState } from "react";
import { Trash2, ChevronDown } from "lucide-react";
import GlassCard from "./GlassCard";

function BudgetCard({

    budget,

    onDelete

}) {
    // =========================
    // Progress %
    // =========================

    const percentage = Math.min(

        (
            (budget.spent || 0) /
            (budget.limit || 1)
        ) * 100,

        100
    );

    const [collapsed, setCollapsed] = useState(false);

    return (

        <GlassCard
            className="
                relative
                self-start
                overflow-hidden
                p-6
                border
                border-white/10
                bg-white/[0.03]
                backdrop-blur-xl
                hover:border-white/20
                transition-all
                duration-300
            "
        >

            <div
                className="
                    absolute
                    inset-x-0
                    top-0
                    h-[2px]
                "
                style={{
                    background:
                        percentage >= 90
                            ? "#ef4444"
                            : percentage >= 70
                            ? "#eab308"
                            : "#22c55e"
                }}
            />

            {/* =========================
                Header
            ========================= */}

            <div className="
                flex
                items-center
                justify-between
                mb-4
            ">

                <div>
                    <h2 className="
                        text-lg
                        font-bold
                    ">
                        {budget.category}
                    </h2>

                    {collapsed && (
                        <span
                            className="text-xs font-semibold"
                            style={{
                                color: percentage >= 90 ? "#f87171" : percentage >= 70 ? "#eab308" : "#4ade80"
                            }}
                        >
                            {percentage.toFixed(0)}% used
                        </span>
                    )}
                </div>

                <div className="
                    flex
                    items-center
                    gap-2
                ">

                    {budget.exceeded && (

                        <span className="
                            bg-red-500/20
                            text-red-400
                            px-3
                            py-1
                            rounded-full
                            text-sm
                        ">
                            Over Budget
                        </span>

                    )}

                    <button
                        onClick={() => setCollapsed(c => !c)}
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
                            text-purple-300
                            hover:bg-purple-500/20
                            transition-all
                        "
                        title={collapsed ? "Expand" : "Collapse"}
                    >
                        <ChevronDown size={14} style={{ transition: "transform 0.2s ease", transform: collapsed ? "rotate(0deg)" : "rotate(180deg)" }} />
                    </button>

                    <button

                        onClick={() =>

                            onDelete(
                                budget.id,
                                budget.category
                            )

                        }

                        className="
                            w-9
                            h-9
                            rounded-lg
                            flex
                            items-center
                            justify-center
                            bg-red-500/10
                            border
                            border-red-500/20
                            text-red-300
                            hover:bg-red-500/20
                            transition-all
                            transition
                        "

                        title="Delete Budget"
                    >

                        <Trash2 size={14} />

                    </button>

                </div>

            </div>

            {!collapsed && (
            <>

            {/* =========================
                Numbers
            ========================= */}

            <div className="mb-5">

                <p className="
                    text-zinc-400
                    text-lg
                ">

                    ₹{
                        (budget.spent || 0)
                            .toLocaleString("en-IN")
                    }

                    {" / "}

                    ₹{
                        (budget.limit || 0)
                            .toLocaleString("en-IN")
                    }

                </p>

                <p className="text-[11px] text-zinc-500 mt-1">
                    spent this month
                </p>

            </div>

            {/* =========================
                Progress Bar
            ========================= */}

            <div
                className="
                    w-full
                    h-2
                    bg-white/5
                    rounded-full
                    overflow-hidden
                    mb-4
                "
            >

                <div
                    style={{
                        width: `${percentage}%`
                    }}
                    className={`
                        h-full
                        rounded-full
                        transition-all
                        duration-700

                        ${
                            percentage >= 90
                                ? "bg-red-400"
                                : percentage >= 70
                                ? "bg-yellow-400"
                                : "bg-green-400"
                        }
                    `}
                />

            </div>

            {/* =========================
                Footer
            ========================= */}

            <div className="
                flex
                justify-between
                text-xs
            ">

                <span
                    className={`
                        font-semibold

                        ${
                            percentage >= 90
                                ? "text-red-400"
                                : percentage >= 70
                                ? "text-yellow-400"
                                : "text-green-400"
                        }
                    `}
                >
                    {percentage.toFixed(0)}% used
                </span>

                <span
                    className={
                        budget.remaining >= 0
                            ? "font-semibold text-green-400"
                            : "font-semibold text-red-400"
                    }
                >

                    {

                        budget.remaining >= 0

                        ? `₹${budget.remaining.toLocaleString("en-IN")} left`

                        : `₹${Math.abs(
                            budget.remaining
                        ).toLocaleString("en-IN")} over`

                    }

                </span>

            </div>

            {/* =========================
                AI Warning
            ========================= */}

            {percentage >= 80 && (

                <div
                    className={`
                        mt-5
                        border
                        p-4
                        rounded-2xl

                        ${
                            budget.exceeded

                            ? `
                                bg-red-500/10
                                border-red-500/30
                                text-red-400
                            `

                            : `
                                bg-yellow-500/10
                                border-yellow-500/30
                                text-yellow-400
                            `
                        }
                    `}
                >

                    {
                        budget.exceeded

                        ? (
                            <>
                                🚨 Budget Exceeded

                                <p className="mt-2">

                                    You have spent

                                    {" "}

                                    ₹{
                                        Math.abs(
                                            budget.remaining
                                        ).toLocaleString("en-IN")
                                    }

                                    {" "}

                                    more than your

                                    {" "}

                                    <strong>
                                        {budget.category}
                                    </strong>

                                    {" "}budget.

                                </p>
                            </>
                        )

                        : (
                            <>
                                ⚠️ Budget Warning

                                <p className="mt-2">

                                    You have already used

                                    {" "}

                                    {percentage.toFixed(0)}%

                                    {" "}of your

                                    {" "}

                                    <strong>
                                        {budget.category}
                                    </strong>

                                    {" "}budget.

                                </p>
                            </>
                        )
                    }

                </div>

            )}

            </>
            )}

        </GlassCard>

    );
}

export default BudgetCard;