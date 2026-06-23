import { useEffect, useState } from "react";
import API from "../services/api";
import InvestmentRecommendationSection from "../components/InvestmentRecommendationSection";
import PortfolioTab from "../components/PortfolioTab";
import SIPTracker from "../components/SIPTracker";
import MutualFundsTab from "../components/MutualFundsTab";
import USStocksTab from "../components/USStocksTab";
import MarketTicker from "../components/MarketTicker";

const TABS = ["My Portfolio", "SIP Tracker", "Mutual Funds", "US Stocks", "AI Advisor"];

function InvestmentsPage() {
    const [activeTab, setActiveTab] = useState("My Portfolio");
    const [recommendation, setRecommendation] = useState(null);
    const [loadingAI, setLoadingAI] = useState(false);

    const fetchRecommendation = async () => {
        try {
            setLoadingAI(true);
            const res = await API.get("/investments");
            setRecommendation(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingAI(false);
        }
    };

    return (
        <div className="mb-10">
            <MarketTicker />

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-500/10 border border-purple-500/20">
                    📈
                </div>
                <div>
                    <div className="text-[11px] font-bold tracking-[0.12em] text-zinc-500">PHASE 4</div>
                    <h2 className="text-lg font-bold">Investment Portfolio</h2>
                </div>
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 mb-6 p-1 rounded-xl bg-white/[0.03] border border-white/10 w-fit">
                {TABS.map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            activeTab === tab
                                ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                : "text-zinc-400 hover:text-zinc-200"
                        }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Portfolio tab */}
            {activeTab === "My Portfolio" && <PortfolioTab />}

            {/* SIP Tracker tab */}
            {activeTab === "SIP Tracker" && (
                <div className="relative overflow-hidden p-6 border border-white/10 bg-white/[0.03] backdrop-blur-xl rounded-2xl mb-6">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                    <SIPTracker />
                </div>
            )}

            {/* Mutual Funds tab */}
            {activeTab === "Mutual Funds" && (
                <div className="relative overflow-hidden p-6 border border-white/10 bg-white/[0.03] backdrop-blur-xl rounded-2xl mb-6">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                    <MutualFundsTab />
                </div>
            )}

            {/* US Stocks tab */}
            {activeTab === "US Stocks" && (
                <div className="relative overflow-hidden p-6 border border-white/10 bg-white/[0.03] backdrop-blur-xl rounded-2xl mb-6">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                    <USStocksTab />
                </div>
            )}

            {/* AI Advisor tab */}
            {activeTab === "AI Advisor" && (
                <div>
                    {!recommendation && (
                        <div className="relative overflow-hidden p-6 border border-white/10 bg-white/[0.03] backdrop-blur-xl rounded-2xl mb-6">
                            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                            <p className="text-sm text-zinc-400 mb-5">
                                Generate personalized investment recommendations based on your financial profile,
                                savings, spending behaviour and goals.
                            </p>
                            <button
                                onClick={fetchRecommendation}
                                disabled={loadingAI}
                                className="px-5 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-violet-600 hover:opacity-90 transition-all text-sm font-semibold"
                            >
                                {loadingAI ? "Generating..." : "Generate Recommendation"}
                            </button>
                        </div>
                    )}

                    {loadingAI && (
                        <div className="flex items-center justify-center py-20 text-zinc-400">
                            <div className="px-6 py-4 rounded-xl border border-white/10 bg-white/[0.03]">
                                Generating AI Portfolio...
                            </div>
                        </div>
                    )}

                    {recommendation && !loadingAI && (
                        <div>
                            <button
                                onClick={fetchRecommendation}
                                className="mb-6 px-5 py-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:bg-purple-500/20 transition-all text-sm font-semibold"
                            >
                                Regenerate
                            </button>
                            <InvestmentRecommendationSection recommendation={recommendation} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default InvestmentsPage;
