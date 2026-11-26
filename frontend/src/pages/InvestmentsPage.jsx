import { useState } from "react";
import API from "../services/api";
import InvestmentRecommendationSection from "../components/InvestmentRecommendationSection";
import PortfolioTab from "../components/PortfolioTab";
import DiscoverPage from "../components/DiscoverPage";
import SIPTracker from "../components/SIPTracker";
import MutualFundsTab from "../components/MutualFundsTab";
import USStocksTab from "../components/USStocksTab";
import MarketTicker from "../components/MarketTicker";
import { Button, cx } from "../components/ui";

const TABS = ["My Portfolio", "Discover", "SIP Tracker", "Mutual Funds", "US Stocks", "AI Advisor"];  // labels are also the keys

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


            {/* Tab bar: the same pills as the section tabs above */}
            <div role="tablist" aria-label="Investments" className="flex gap-1 mb-6 -mx-1 px-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {TABS.map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab}
                        onClick={() => setActiveTab(tab)}
                        className={cx("h-9 px-4 rounded-full text-small font-medium whitespace-nowrap shrink-0 transition-colors",
                            activeTab === tab ? "bg-surface-sunken text-ink" : "text-ink-3 hover:text-ink")}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Portfolio tab */}
            {activeTab === "My Portfolio" && <PortfolioTab />}

            {/* Discover: IPOs, mutual funds and stocks you can invest in */}
            {activeTab === "Discover" && <DiscoverPage />}

            {/* SIP Tracker tab */}
            {activeTab === "SIP Tracker" && (
                <div className="max-w-2xl rounded-card bg-surface border border-line p-5 mb-6">
                    <SIPTracker />
                </div>
            )}

            {/* Mutual Funds tab */}
            {activeTab === "Mutual Funds" && (
                <div className="max-w-2xl rounded-card bg-surface border border-line p-5 mb-6">
                    <MutualFundsTab />
                </div>
            )}

            {/* US Stocks tab */}
            {activeTab === "US Stocks" && (
                <div className="max-w-2xl rounded-card bg-surface border border-line p-5 mb-6">
                    <USStocksTab />
                </div>
            )}

            {/* AI Advisor tab */}
            {activeTab === "AI Advisor" && (
                <div>
                    {!recommendation && (
                        <div className="max-w-2xl rounded-card bg-surface border border-line p-5 mb-6">
                            <p className="text-heading text-ink">A mix that fits you</p>
                            <p className="text-body text-ink-2 mt-1 mb-4">
                                FinTwin suggests how to split your savings across kinds of investment, from your income,
                                spending and goals. It's general guidance, not advice on specific funds.
                            </p>
                            <Button onClick={fetchRecommendation} disabled={loadingAI}>
                                {loadingAI ? "Working it out…" : "Show my mix"}
                            </Button>
                        </div>
                    )}

                    {loadingAI && (
                        <div className="max-w-2xl rounded-card bg-surface border border-line px-6 py-10 text-center text-small text-ink-3" role="status">
                            Working out your mix…
                        </div>
                    )}

                    {recommendation && !loadingAI && (
                        <div>
                            <Button variant="secondary" size="sm" className="mb-6" onClick={fetchRecommendation}>Work it out again</Button>
                            <InvestmentRecommendationSection recommendation={recommendation} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default InvestmentsPage;
