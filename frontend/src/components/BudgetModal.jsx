import { useState } from "react";
import { toast } from "react-hot-toast";
import GlassCard from "./GlassCard";
import { Plus } from "lucide-react";

function BudgetModal({

    createBudget

}) {

    const [category, setCategory] =
        useState("");

    const [limitAmount,
        setLimitAmount] =
        useState("");

    const [creatingBudget,
        setCreatingBudget] =
        useState(false);    

    const handleCreateBudget = async () => {

        if (
            !category.trim() ||
            !limitAmount ||
            Number(limitAmount) <= 0
        ) {

            toast.error(
                "Please enter category and budget amount."
            );

            return;
        }

        setCreatingBudget(true);

        try {

            await createBudget({

                category,

                limitAmount:
                    Number(limitAmount)
            });

            setCategory("");

            setLimitAmount("");

        } finally {

            setCreatingBudget(false);
        }
    };    

    return (

        <GlassCard
            className="
                relative
                overflow-hidden
                p-6
                mb-6
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
                    text-[11px]
                    font-bold
                    tracking-[0.12em]
                    text-zinc-500
                    mb-4
                "
            >
                CREATE BUDGET
            </div>

            <div className="
                grid
                grid-cols-1
                md:grid-cols-3
                gap-4
            ">

                {/* Category */}

                <input
                    type="text"
                    placeholder="Category"
                    value={category}
                    onChange={(e) =>
                        setCategory(
                            e.target.value
                        )
                    }
                    className="
                        bg-zinc-800
                        p-4
                        rounded-2xl
                        outline-none
                    "
                />

                {/* Amount */}

                <input
                    type="number"
                    placeholder="Monthly limit (₹)"
                    value={limitAmount}
                    onChange={(e) =>
                        setLimitAmount(
                            e.target.value
                        )
                    }
                    className="
                        no-spinner
                        bg-zinc-800
                        p-4
                        rounded-2xl
                        outline-none
                    "
                />

                {/* Button */}

                <button

                    disabled={creatingBudget}

                    onClick={handleCreateBudget}

                    className={`
                        flex
                        items-center
                        justify-center
                        gap-2
                        rounded-xl
                        font-semibold
                        transition-all
                        px-4

                        ${
                            creatingBudget

                            ? "bg-zinc-700 cursor-not-allowed"

                            : "bg-purple-600 hover:bg-purple-700"
                        }
                    `}
                >

                    <Plus size={15} />

                    {
                        creatingBudget
                        ? "Creating..."
                        : "Create Budget"
                    }

                </button>

            </div>

        </GlassCard>
    );
}

export default BudgetModal;