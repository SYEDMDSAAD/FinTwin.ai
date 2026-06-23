import GlassCard from "./GlassCard";
import { Plus } from "lucide-react";

function IncomeExpenseSection({
    incomeText,
    setIncomeText,
    addIncome,
    expenseText,
    setExpenseText,
    addExpense
}) {

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
                    text-[11px]
                    font-bold
                    tracking-[0.12em]
                    text-zinc-500
                    mb-5
                "
            >
                QUICK ENTRY
            </div>

            {/* Income */}

            <div className="mb-5">

                <label
                    className="
                        block
                        mb-2
                        text-xs
                        tracking-wide
                        text-zinc-500
                    "
                >
                    ADD INCOME
                </label>

                <div className="flex gap-3">

                    <input
                        type="text"
                        value={incomeText}
                        onChange={(e) =>
                            setIncomeText(e.target.value)
                        }
                        placeholder="e.g. Salary 50000"
                        className="
                            flex-1
                            bg-white/[0.04]
                            border
                            border-white/10
                            rounded-xl
                            px-4
                            py-3
                            text-sm
                            outline-none
                            focus:border-green-500/40
                            transition
                        "
                    />

                    <button
                        onClick={addIncome}
                        className="
                            flex
                            items-center
                            gap-2
                            px-5
                            rounded-xl
                            text-white
                            font-medium
                            bg-gradient-to-r
                            from-green-500
                            to-green-600
                            hover:scale-105
                            transition
                        "
                    >

                        <Plus size={16} />
                        Add

                    </button>

                </div>

            </div>

            {/* Expense */}

            <div>

                <label
                    className="
                        block
                        mb-2
                        text-xs
                        tracking-wide
                        text-zinc-500
                    "
                >
                    ADD EXPENSE
                </label>

                <div className="flex gap-3">

                    <input
                        type="text"
                        value={expenseText}
                        onChange={(e) =>
                            setExpenseText(e.target.value)
                        }
                        placeholder="e.g. Swiggy 450"
                        className="
                            flex-1
                            bg-white/[0.04]
                            border
                            border-white/10
                            rounded-xl
                            px-4
                            py-3
                            text-sm
                            outline-none
                            focus:border-red-500/40
                            transition
                        "
                    />

                    <button
                        onClick={addExpense}
                        className="
                            flex
                            items-center
                            gap-2
                            px-5
                            rounded-xl
                            text-white
                            font-medium
                            bg-gradient-to-r
                            from-red-500
                            to-red-600
                            hover:scale-105
                            transition
                        "
                    >

                        <Plus size={16} />
                        Add

                    </button>

                </div>

            </div>

        </GlassCard>

    );
}

export default IncomeExpenseSection;