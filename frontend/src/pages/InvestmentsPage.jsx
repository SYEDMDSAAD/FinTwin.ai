import { useState } from "react";
import InvestmentPlanSection from "../components/InvestmentPlanSection";
import FutureTwin from "../components/FutureTwin";
import PortfolioTab from "../components/PortfolioTab";
import DiscoverPage from "../components/DiscoverPage";
import SIPTracker from "../components/SIPTracker";
import MutualFundsTab from "../components/MutualFundsTab";
import USStocksTab from "../components/USStocksTab";
import MarketTicker from "../components/MarketTicker";
import { cx } from "../components/ui";

const TABS = ["My Portfolio", "Future Twin", "Discover", "SIP Tracker", "Mutual Funds", "US Stocks", "Plan"];  // labels are also the keys

function InvestmentsPage() {
    // Another screen can open a tab here (Spend Guard → Future Twin) by leaving its name behind
    const [activeTab, setActiveTab] = useState(() => {
        try {
            const asked = localStorage.getItem("investmentsTab");
            localStorage.removeItem("investmentsTab");
            return TABS.includes(asked) ? asked : "My Portfolio";
        } catch {
            return "My Portfolio";
        }
    });

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

            {activeTab === "Future Twin" && <FutureTwin onOpenSips={() => setActiveTab("SIP Tracker")} />}

            {activeTab === "Plan" && <InvestmentPlanSection />}
        </div>
    );
}

export default InvestmentsPage;
