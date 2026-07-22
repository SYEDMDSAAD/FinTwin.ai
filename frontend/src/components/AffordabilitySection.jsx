import { useState } from "react";
import GlassCard from "./GlassCard";
import {
    CheckCircle2,
    AlertTriangle,
    XCircle,
    Loader2,
    IndianRupee,
} from "lucide-react";

function AffordabilitySection({

    price,
    setPrice,
    analyzeAffordability,
    affordability

}) {

    const [analyzing, setAnalyzing] = useState(false);

    const handleAnalyze = async () => {
        if (analyzing) return;
        setAnalyzing(true);
        try {
            await analyzeAffordability();
        } finally {
            setAnalyzing(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter") handleAnalyze();
    };

    // Verdict derived from the risk + outright-affordability signals the
    // backend already computes — surfaced as one clear headline instead of
    // making the user read three separate stat boxes to figure it out.
    const verdict = affordability && (() => {
        if (!affordability.canAffordOutright) {
            return {
                tone: "red",
                Icon: XCircle,
                title: "Not affordable outright",
                detail: affordability.monthsToSave > 0
                    ? `Save for about ${affordability.monthsToSave} month${affordability.monthsToSave > 1 ? "s" : ""}, or use the suggested EMI below.`
                    : "Your current savings rate doesn't cover this — consider the EMI option.",
            };
        }
        if (affordability.risk === "High") {
            return {
                tone: "yellow",
                Icon: AlertTriangle,
                title: "Affordable, but risky",
                detail: "This would leave a thin emergency buffer. Consider the EMI option instead of paying outright.",
            };
        }
        if (affordability.risk === "Medium") {
            return {
                tone: "yellow",
                Icon: AlertTriangle,
                title: "Affordable, with some strain",
                detail: "You can cover this, but it'll narrow your safety buffer for a few months.",
            };
        }
        return {
            tone: "green",
            Icon: CheckCircle2,
            title: "Comfortably affordable",
            detail: "You can cover this outright without denting your emergency buffer.",
        };
    })();

    const toneClasses = {
        green: {
            border: "border-green-500/20",
            bg: "bg-green-500/10",
            text: "text-green-400",
        },
        yellow: {
            border: "border-yellow-500/20",
            bg: "bg-yellow-500/10",
            text: "text-yellow-400",
        },
        red: {
            border: "border-red-500/20",
            bg: "bg-red-500/10",
            text: "text-red-400",
        },
    };

    // Visual split of "price" vs "what's left" out of total available funds,
    // reconstructed from remainingSavings (= availableFunds - price) since
    // the raw availableFunds figure isn't part of the API response.
    const availableFunds = affordability
        ? affordability.remainingSavings + Number(price || 0)
        : 0;

    const usedPct = affordability && availableFunds > 0
        ? Math.max(0, Math.min(100, (Number(price) / availableFunds) * 100))
        : 0;

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

                <div className="relative w-full">

                    <IndianRupee
                        size={16}
                        className="
                            absolute
                            left-4
                            top-1/2
                            -translate-y-1/2
                            text-zinc-500
                            pointer-events-none
                        "
                    />

                    <input
                        type="number"
                        placeholder="Enter product price"
                        value={price}
                        onChange={(e) =>
                            setPrice(e.target.value)
                        }
                        onKeyDown={handleKeyDown}
                        className="
                            no-spinner
                            w-full
                            bg-white/[0.03]
                            backdrop-blur-xl
                            border
                            border-white/10
                            rounded-xl
                            pl-10
                            pr-4
                            py-3
                            text-sm
                            outline-none
                            focus:border-purple-500/40
                        "
                    />

                </div>

                <button
                    onClick={handleAnalyze}
                    disabled={analyzing || !price}
                    className="
                        flex
                        items-center
                        justify-center
                        gap-2
                        px-5
                        py-3
                        rounded-xl
                        bg-gradient-to-r
                        from-purple-500
                        to-violet-600
                        hover:opacity-90
                        disabled:opacity-50
                        disabled:cursor-not-allowed
                        transition-all
                        text-sm
                        font-semibold
                        whitespace-nowrap
                    "
                >
                    {analyzing ? (
                        <>
                            <Loader2 size={15} className="animate-spin" />
                            Analyzing...
                        </>
                    ) : (
                        "Analyze →"
                    )}
                </button>

            </div>

            {affordability && verdict && (

                <div
                    className={`
                        flex
                        items-start
                        gap-3
                        rounded-xl
                        border
                        p-4
                        mb-4
                        ${toneClasses[verdict.tone].border}
                        ${toneClasses[verdict.tone].bg}
                    `}
                >

                    <verdict.Icon
                        size={20}
                        className={`shrink-0 mt-0.5 ${toneClasses[verdict.tone].text}`}
                    />

                    <div>
                        <p className={`text-sm font-bold ${toneClasses[verdict.tone].text}`}>
                            {verdict.title}
                        </p>
                        <p className="text-xs text-zinc-400 mt-1">
                            {verdict.detail}
                        </p>
                    </div>

                </div>
            )}

            {affordability && availableFunds > 0 && (

                <div className="mb-5">

                    <div className="flex justify-between text-[11px] text-zinc-500 mb-1.5">
                        <span>₹{Number(price).toLocaleString("en-IN")} price</span>
                        <span>₹{availableFunds.toLocaleString("en-IN")} available</span>
                    </div>

                    <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                            className={`
                                h-full
                                rounded-full
                                transition-all
                                duration-500
                                ${
                                    usedPct >= 80
                                        ? "bg-red-400"
                                        : usedPct >= 50
                                        ? "bg-yellow-400"
                                        : "bg-green-400"
                                }
                            `}
                            style={{ width: `${usedPct}%` }}
                        />
                    </div>

                    <p className="text-[11px] text-zinc-500 mt-1.5">
                        This purchase uses {usedPct.toFixed(0)}% of your available savings.
                    </p>

                </div>
            )}

            {affordability && (

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

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

                        <h3 className="text-zinc-400 text-[10px] uppercase tracking-[0.08em]">
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
                                    .toLocaleString("en-IN")
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

                        <h3 className="text-zinc-400 text-[10px] uppercase tracking-[0.08em]">
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
                                    .toLocaleString("en-IN")
                            } / mo

                        </p>

                        {affordability.emiMonths && (
                            <p className="text-[11px] text-zinc-500 mt-1">
                                {affordability.emiMonths} months
                                {affordability.emiAnnualInterestRate
                                    ? ` at an assumed ${affordability.emiAnnualInterestRate}% p.a.`
                                    : ""}
                            </p>
                        )}

                    </div>

                    {/* Monthly savings avg */}

                    <div className="
                        bg-white/[0.02]
                        border
                        border-white/10
                        rounded-xl
                        p-4
                    ">

                        <h3 className="text-zinc-400 text-[10px] uppercase tracking-[0.08em]">
                            Avg Monthly Savings
                        </h3>

                        <p className={`
                            text-xl
                            font-bold
                            mt-3
                            ${
                                affordability.monthlySavingsAvg >= 0
                                    ? "text-emerald-400"
                                    : "text-red-400"
                            }
                        `}>

                            ₹{
                                affordability.monthlySavingsAvg
                                    .toLocaleString("en-IN")
                            }

                        </p>

                    </div>

                </div>
            )}

        </GlassCard>
    );
}

export default AffordabilitySection;
