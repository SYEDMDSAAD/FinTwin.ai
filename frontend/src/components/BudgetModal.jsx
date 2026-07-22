import { useState } from "react";
import { toast } from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import GlassCard from "./GlassCard";
import AnimatedDots from "./AnimatedDots";
import { Plus, ChevronDown, Sparkles } from "lucide-react";

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

    const [open, setOpen] = useState(true);

    const canCreate = category.trim() && limitAmount && Number(limitAmount) > 0;

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
                p-5
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

            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    width: "100%", background: "none", border: "none", padding: 0,
                    cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                    marginBottom: open ? 12 : 0,
                }}
            >
                {open ? (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em" }}>CREATE BUDGET</span>
                ) : (
                    <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>Create Budget</span>
                )}
                <ChevronDown size={17} style={{ color: "var(--text-primary)", flexShrink: 0, transition: "transform 0.2s ease", transform: open ? "rotate(180deg)" : "rotate(0deg)" }} />
            </button>

            {open && (
            <div className="
                grid
                grid-cols-1
                md:grid-cols-3
                gap-3
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
                    className="goal-input"
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
                    className="goal-input"
                />

                {/* Button */}

                <button

                    disabled={creatingBudget || !canCreate}

                    onClick={handleCreateBudget}

                    style={{
                        position: "relative", overflow: "hidden",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        borderRadius: 12, fontWeight: 600, fontSize: 13, padding: "12px 16px",
                        border: "none", cursor: creatingBudget ? "not-allowed" : "pointer",
                        background: canCreate && !creatingBudget ? "linear-gradient(135deg, #a78bfa, #7c3aed)" : "var(--bg-subtle)",
                        color: canCreate && !creatingBudget ? "#fff" : "var(--text-dim)",
                        transition: "opacity 0.2s",
                    }}
                >

                    <AnimatePresence mode="wait">
                        {creatingBudget ? (
                            <motion.span key="creating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} style={{ display: "flex" }}>
                                    <Sparkles size={14} />
                                </motion.span>
                                <span>Creating<AnimatedDots /></span>
                            </motion.span>
                        ) : (
                            <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <Plus size={15} />
                                Create Budget
                            </motion.span>
                        )}
                    </AnimatePresence>

                    {creatingBudget && (
                        <motion.span
                            style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)" }}
                            animate={{ x: ["-100%", "100%"] }}
                            transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                        />
                    )}

                </button>

            </div>
            )}

        </GlassCard>
    );
}

export default BudgetModal;
