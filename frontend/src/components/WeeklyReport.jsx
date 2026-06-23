import {
    useState,
    useRef
} from "react";

const STORAGE_KEY = "fintwin_weekly_report";

function loadReport() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
function saveReport(report) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ report, savedAt: new Date().toISOString() })); } catch {}
}

import GlassCard from "./GlassCard";

import API from "../services/api";

import {
    FileText,
    ShieldAlert,
    TrendingUp,
    Brain,
    Download,
    Sparkles
} from "lucide-react";

function WeeklyReport() {

    const saved = loadReport();

    const [report, setReport] =
        useState(saved?.report || null);

    const [loading, setLoading] =
        useState(false);

    const [generated, setGenerated] =
        useState(!!saved?.report);

    const [exporting, setExporting] =
        useState(false);

    const [savedAt, setSavedAt] =
        useState(saved?.savedAt || null);

    const reportRef =
        useRef();

    // =====================================
    // FETCH REPORT
    // =====================================

    const fetchReport = async () => {

        setLoading(true);
        setGenerated(true);

        try {

            const response =
                await API.get(
                    "/reports/weekly"
                );

            setReport(
                response.data
            );

            saveReport(response.data);
            setSavedAt(new Date().toISOString());

        } catch (error) {

            console.log(error);

        } finally {

            setLoading(false);
        }
    };

    // =====================================
    // DOWNLOAD PDF
    // =====================================

    const downloadPDF = async () => {

        try {

            setExporting(true);

            const response =
                await API.get(
                    "/reports/weekly/pdf",
                    {
                        responseType: "blob"
                    }
                );

            const url =
                window.URL.createObjectURL(
                    response.data
                );

            const link =
                document.createElement("a");

            link.href = url;

            link.download =
                "FinTwin_Report.pdf";

            link.click();

            window.URL.revokeObjectURL(
                url
            );

        } catch (error) {

            console.log(error);
        } finally {

            setExporting(false);
        }    
    };

    // =====================================
    // LANDING — not yet generated
    // =====================================

    if (!generated) {

        return (

            <GlassCard
                className="
                    relative
                    overflow-hidden
                    p-10
                    border
                    border-white/10
                    bg-white/[0.03]
                    backdrop-blur-xl
                    flex
                    flex-col
                    items-center
                    text-center
                    gap-6
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

                <div className="
                    w-16
                    h-16
                    rounded-2xl
                    flex
                    items-center
                    justify-center
                    bg-purple-500/10
                    border
                    border-purple-500/20
                ">
                    <FileText size={32} className="text-purple-400" />
                </div>

                <div>
                    <div className="
                        text-[11px]
                        font-bold
                        tracking-[0.12em]
                        text-zinc-500
                        mb-2
                    ">
                        EXECUTIVE REPORTS
                    </div>
                    <h1 className="text-3xl font-bold mb-2">
                        Weekly Executive Report
                    </h1>
                    <p className="text-sm text-zinc-400 max-w-md">
                        Get an AI-generated deep-dive into your finances — health score, risk analysis, insights, and personalised recommendations.
                    </p>
                </div>

                <button
                    onClick={fetchReport}
                    className="
                        flex
                        items-center
                        gap-2
                        px-6
                        py-3
                        rounded-xl
                        text-sm
                        font-semibold
                        bg-purple-600
                        hover:bg-purple-700
                        transition-colors
                    "
                >
                    <Sparkles size={18} />
                    Generate Report
                </button>

            </GlassCard>
        );
    }

    // =====================================
    // LOADING — generating
    // =====================================

    if (loading) {

        return (

            <GlassCard
                className="
                    relative
                    overflow-hidden
                    p-10
                    border
                    border-white/10
                    bg-white/[0.03]
                    backdrop-blur-xl
                    flex
                    flex-col
                    items-center
                    text-center
                    gap-6
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

                <div className="
                    w-16
                    h-16
                    rounded-2xl
                    flex
                    items-center
                    justify-center
                    bg-purple-500/10
                    border
                    border-purple-500/20
                    animate-pulse
                ">
                    <Brain size={32} className="text-purple-400" />
                </div>

                <div>
                    <h2 className="text-2xl font-bold mb-2">
                        Generating AI Executive Report...
                    </h2>
                    <p className="text-sm text-zinc-400">
                        Analysing your transactions, budgets, and goals
                    </p>
                </div>

                <div className="flex gap-1.5">
                    {[0, 1, 2].map(i => (
                        <span
                            key={i}
                            className="w-2 h-2 rounded-full bg-purple-500 animate-bounce"
                            style={{ animationDelay: `${i * 0.15}s` }}
                        />
                    ))}
                </div>

            </GlassCard>
        );
    }

    // =====================================
    // UI
    // =====================================

    return (

        <div
            ref={reportRef}
            className="
                space-y-8
                bg-zinc-950
                p-6
            "
        >

            {/* HEADER */}

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

                <div className="
                    flex
                    items-center
                    justify-between
                    flex-wrap
                    gap-4
                ">

                    <div>

                        <div
                            className="
                                text-[11px]
                                font-bold
                                tracking-[0.12em]
                                text-zinc-500
                                mb-1
                            "
                        >
                            EXECUTIVE REPORTS
                        </div>

                        <h1
                            className="
                                text-2xl
                                font-bold
                            "
                        >
                            Weekly Executive Report
                        </h1>

                        <p className="text-sm text-zinc-500 mt-1">
                            AI-generated financial intelligence
                        </p>

                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {savedAt && (
                            <span className="text-[11px] text-zinc-500 font-mono">
                                Generated {new Date(savedAt).toLocaleString()}
                            </span>
                        )}
                        <button
                            onClick={fetchReport}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Sparkles size={16} />
                            Regenerate
                        </button>
                        <button
                            onClick={downloadPDF}
                            disabled={exporting}
                            className={`
                                flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                                ${exporting ? "bg-purple-800 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700"}
                            `}
                        >
                            <Download size={20} />
                            {exporting ? "Exporting..." : "Export PDF"}
                        </button>
                    </div>

                </div>

            </GlassCard>

            {/* SCORE */}

            <GlassCard
                className="
                    p-6
                    border
                    border-white/10
                    bg-white/[0.03]
                "
            >

                <div className="
                    flex
                    items-center
                    gap-4
                ">

                    <TrendingUp
                        size={28}
                        className="
                            text-green-400
                        "
                    />

                    <div>

                        <h2 className="
                            text-2xl
                            font-bold
                        ">
                            Financial Health Score
                        </h2>

                        <p className="
                            text-4xl
                            font-bold
                            mt-2
                            text-green-400
                        ">
                            {report?.financialScore}/100
                        </p>

                    </div>

                </div>

            </GlassCard>

            <div className="
                grid
                grid-cols-1
                md:grid-cols-3
                gap-4
                mb-8
            ">

                <GlassCard
                    className="
                        p-5
                        border
                        border-white/10
                        bg-white/[0.03]
                    "
                >

                    <p className="
                        text-[10px]
                        uppercase
                        tracking-[0.08em]
                        text-zinc-500
                        mb-2
                    ">
                        Net Worth
                    </p>

                    <h3 className="
                        text-2xl
                        font-bold
                        text-purple-400
                    ">
                        ₹{
                            report?.netWorth
                            ?.toLocaleString()
                        }
                    </h3>

                </GlassCard>

                <GlassCard
                    className="
                        p-5
                        border
                        border-white/10
                        bg-white/[0.03]
                    "
                >

                    <p className="
                        text-[10px]
                        uppercase
                        tracking-[0.08em]
                        text-zinc-500
                        mb-2
                    ">
                        Spending Health
                    </p>

                    <h3 className="
                        text-2xl
                        font-bold
                        text-green-400
                    ">
                        {
                            report?.spendingHealth
                        }
                    </h3>

                </GlassCard>

                <GlassCard
                    className="
                        p-5
                        border
                        border-white/10
                        bg-white/[0.03]
                    "
                >

                    <p className="
                        text-[10px]
                        uppercase
                        tracking-[0.08em]
                        text-zinc-500
                    ">
                        Monthly Leakage
                    </p>

                    <h3 className="
                        text-2xl
                        font-bold
                        text-red-400
                    ">
                        ₹{
                            report?.monthlyLeakage
                            ?.toLocaleString()
                        }
                    </h3>

                </GlassCard>

            </div>

            {/* REPORT SECTIONS */}

            <div className="
                grid
                grid-cols-1
                xl:grid-cols-2
                gap-4
            ">

                {/* SUMMARY */}

                <GlassCard
                    className="
                        p-6
                        border
                        border-white/10
                        bg-white/[0.03]
                    "
                >

                    <div className="
                        flex
                        items-center
                        gap-3
                        mb-5
                    ">

                        <div
                            className="
                                w-8
                                h-8
                                rounded-lg
                                flex
                                items-center
                                justify-center
                                bg-cyan-500/10
                                border
                                border-cyan-500/20
                            "
                        >
                            <FileText
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
                                    text-cyan-400/60
                                "
                            >
                                EXECUTIVE SUMMARY
                            </div>

                            <h2
                                className="
                                    text-base
                                    font-bold
                                "
                            >
                                Summary
                            </h2>

                        </div>

                    </div>

                    <p className="
                        text-sm
                        leading-7
                        text-zinc-300
                    ">
                        {report?.summary}
                    </p>

                </GlassCard>

                {/* INSIGHTS */}

                <GlassCard
                    className="
                        p-6
                        border
                        border-white/10
                        bg-white/[0.03]
                    "
                >

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
                                w-8
                                h-8
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
                                    text-purple-400/60
                                "
                            >
                                AI INSIGHTS
                            </div>

                            <h2 className="text-base font-bold">
                                AI Insights
                            </h2>

                        </div>

                    </div>

                    <p className="
                        text-sm
                        leading-7
                        text-zinc-300
                    ">
                        {report?.insights}
                    </p>

                </GlassCard>

                {/* RISKS */}

                <GlassCard
                    className="
                        p-6
                        border
                        border-white/10
                        bg-white/[0.03]
                    "
                >

                    <div className="
                        flex
                        items-center
                        gap-3
                        mb-5
                    ">

                        <div
                            className="
                                w-8
                                h-8
                                rounded-lg
                                flex
                                items-center
                                justify-center
                                bg-red-500/10
                                border
                                border-red-500/20
                            "
                        >
                            <ShieldAlert
                                size={16}
                                className="text-red-400"
                            />
                        </div>

                        <div>

                            <div
                                className="
                                    text-[10px]
                                    font-bold
                                    tracking-[0.1em]
                                    text-red-400/60
                                "
                            >
                                RISK ANALYSIS
                            </div>

                            <h2 className="text-base font-bold">
                                Risk Analysis
                            </h2>

                        </div>

                    </div>

                    <p className="
                        text-sm
                        leading-7
                        text-zinc-300
                    ">
                        {report?.risks}
                    </p>

                </GlassCard>

                {/* RECOMMENDATIONS */}

                <GlassCard
                    className="
                        p-6
                        border
                        border-white/10
                        bg-white/[0.03]
                    "
                >

                    <div className="
                        flex
                        items-center
                        gap-3
                        mb-5
                    ">

                        <div
                            className="
                                w-8
                                h-8
                                rounded-lg
                                flex
                                items-center
                                justify-center
                                bg-green-500/10
                                border
                                border-green-500/20
                            "
                        >
                            <TrendingUp
                                size={16}
                                className="text-green-400"
                            />
                        </div>

                        <div>

                            <div
                                className="
                                    text-[10px]
                                    font-bold
                                    tracking-[0.1em]
                                    text-green-400/60
                                "
                            >
                                RECOMMENDATIONS
                            </div>

                            <h2 className="text-base font-bold">
                                Recommendations
                            </h2>

                        </div>

                    </div>

                    <p className="
                        text-sm
                        leading-7
                        text-zinc-300
                    ">
                        {report?.recommendations}
                    </p>

                </GlassCard>

            </div>

        </div>
    );
}

export default WeeklyReport;