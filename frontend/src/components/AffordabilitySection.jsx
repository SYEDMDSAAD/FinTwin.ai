import GlassCard from "./GlassCard";

function AffordabilitySection({

    price,
    setPrice,
    analyzeAffordability,
    affordability

}) {

    return (

        <GlassCard
            className="
                relative
                overflow-hidden
                p-6
                mb-10
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
                        w-10
                        h-10
                        rounded-xl
                        flex
                        items-center
                        justify-center
                        bg-yellow-500/10
                        border
                        border-yellow-500/20
                    "
                >
                    💳
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
                        AI ADVISOR
                    </div>

                    <h2
                        className="
                            text-lg
                            font-bold
                            text-white
                        "
                    >
                        Can I Afford This?
                    </h2>

                </div>

            </div>

            <div className="flex flex-col md:flex-row gap-4 mb-5">

                <input
                    type="number"
                    placeholder="Enter Product Price"
                    value={price}
                    onChange={(e) =>
                        setPrice(e.target.value)
                    }
                    className="
                        no-spinner
                        w-full
                        bg-white/[0.03]
                        backdrop-blur-xl
                        border
                        border-white/10
                        rounded-xl
                        px-4
                        py-3
                        text-sm
                        outline-none
                        focus:border-purple-500/40
                    "
                />

                <button
                    onClick={analyzeAffordability}
                    className="
                    px-5
                    py-3
                    rounded-xl
                    bg-gradient-to-r
                    from-purple-500
                    to-violet-600
                    hover:opacity-90
                    transition-all
                    text-sm
                    font-semibold
                    whitespace-nowrap
                "
                >
                    Analyze →
                </button>

            </div>

            {affordability && (

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

                    {/* Risk */}

                    <div className="
                        bg-white/[0.02]
                        border
                        border-white/10
                        rounded-xl
                        p-4
                    ">

                        <p className="
                            text-[10px]
                            uppercase
                            tracking-[0.08em]
                            text-zinc-500
                            mb-2
                        ">
                            Risk Level
                        </p>

                        <p className={`
                            text-xl
                            font-bold
                            mt-3
                            ${
                                affordability.risk === "High"
                                    ? "text-red-400"
                                    : affordability.risk === "Medium"
                                    ? "text-yellow-400"
                                    : "text-green-400"
                            }
                        `}>

                            {affordability.risk}

                        </p>

                    </div>

                    {/* Savings */}

                    <div className="
                        bg-white/[0.02]
                        border
                        border-white/10
                        rounded-xl
                        p-4
                    ">

                        <h3 className="text-zinc-400">
                            Remaining Savings
                        </h3>

                        <p className="
                            text-xl
                            font-bold
                            mt-3
                            text-cyan-400
                        ">

                            ₹{
                                affordability.remainingSavings
                                    .toLocaleString()
                            }

                        </p>

                    </div>

                    {/* EMI */}

                    <div className="
                        bg-white/[0.02]
                        border
                        border-white/10
                        rounded-xl
                        p-4
                    ">

                        <h3 className="text-zinc-400">
                            Suggested EMI
                        </h3>

                        <p className="
                            text-xl
                            font-bold
                            mt-3
                            text-purple-400
                        ">

                            ₹{
                                affordability.suggestedEMI
                                    .toLocaleString()
                            } / mo

                        </p>

                    </div>

                </div>
            )}

        </GlassCard>
    );
}

export default AffordabilitySection;