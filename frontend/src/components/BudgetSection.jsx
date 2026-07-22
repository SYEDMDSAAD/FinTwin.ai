import BudgetCard from "./BudgetCard";
import BudgetModal from "./BudgetModal";
import { PieChart } from "lucide-react";

function BudgetSection({

    budgets,

    createBudget,

    deleteBudget

}) {

    return (

        <div className="mb-10">

            {/* =========================
                Modal
            ========================= */}

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
                    <PieChart
                        size={18}
                        className="text-purple-300"
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
                        BUDGETING
                    </div>

                    <h2
                        className="
                            text-lg
                            font-bold
                        "
                    >
                        Budget Manager
                    </h2>

                </div>

            </div>

            <BudgetModal
                createBudget={
                    createBudget
                }
            />

            {/* =========================
                Budget Grid
            ========================= */}

            <div className="
                grid
                grid-cols-1
                md:grid-cols-2
                xl:grid-cols-3
                gap-6
            ">

                {budgets.map((budget) => (

                    <BudgetCard
                        key={budget.id}
                        budget={budget}
                        onDelete={
                            deleteBudget
                        }
                    />

                ))}

            </div>

            {/* =========================
                Summary — after the budget cards, before "Can I Afford This?"
            ========================= */}

            {budgets.length > 0 && (

            <div
                className="
                    grid
                    grid-cols-3
                    gap-2
                    sm:gap-4
                    mt-6
                "
            >

                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-2.5 sm:p-4">
                    <p className="text-[9px] sm:text-[10px] text-zinc-500 uppercase truncate">
                        Total Limit
                    </p>

                    <h3 className="text-sm sm:text-lg md:text-xl font-bold truncate">
                        ₹{
                            budgets
                            .reduce(
                                (sum,b)=>sum+(b.limit||0),
                                0
                            )
                            .toLocaleString("en-IN")
                        }
                    </h3>
                </div>

                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-2.5 sm:p-4">
                    <p className="text-[9px] sm:text-[10px] text-zinc-500 uppercase truncate">
                        Total Spent
                    </p>

                    <h3 className="text-sm sm:text-lg md:text-xl font-bold text-red-400 truncate">
                        ₹{
                            budgets
                            .reduce(
                                (sum,b)=>sum+(b.spent||0),
                                0
                            )
                            .toLocaleString("en-IN")
                        }
                    </h3>
                </div>

                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-2.5 sm:p-4">
                    <p className="text-[9px] sm:text-[10px] text-zinc-500 uppercase truncate">
                        Remaining
                    </p>

                    <h3 className="text-sm sm:text-lg md:text-xl font-bold text-green-400 truncate">
                        ₹{
                            (
                                budgets.reduce(
                                    (s,b)=>s+(b.limit||0),
                                    0
                                )
                                -
                                budgets.reduce(
                                    (s,b)=>s+(b.spent||0),
                                    0
                                )
                            )
                            .toLocaleString("en-IN")
                        }
                    </h3>
                </div>

            </div>

            )}

        </div>
    );
}

export default BudgetSection;