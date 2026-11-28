import { useState } from "react";
import InvestmentPlanSection from "../components/InvestmentPlanSection";
import FutureTwin from "../components/FutureTwin";
import PortfolioTab from "../components/PortfolioTab";
import PortfolioHealthCard from "../components/PortfolioHealthCard";
import DiscoverPage from "../components/DiscoverPage";
import SIPTracker from "../components/SIPTracker";
import MutualFundsTab from "../components/MutualFundsTab";
import USStocksTab from "../components/USStocksTab";
import MarketTicker from "../components/MarketTicker";
import Collections from "../components/invest/Collections";
import BenchmarkCard from "../components/invest/BenchmarkCard";
import useInvestData from "../hooks/useInvestData";
import useFundDetails from "../hooks/useFundDetails";
import { OverlapCard, SectorCard } from "../components/invest/OverlapCard";
import { cx } from "../components/ui";

/*
 * The Invest tab's pages. Each used to be a tab inside one Investments page;
 * now each is a section of its own (see constants/navigation.js), so the
 * sidebar, the header chips, voice and links all reach them the same way.
 */

const EXPLORE = ["Collections", "IPOs, funds & stocks", "Fund watchlist", "US stocks"];

function Explore() {
    const [view, setView] = useState("Collections");
    return (
        <>
            <div role="tablist" aria-label="Explore" className="flex gap-1 mb-6 -mx-1 px-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {EXPLORE.map((v) => (
                    <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
                            className={cx("h-9 px-4 rounded-full text-small font-medium whitespace-nowrap shrink-0 transition-colors",
                                view === v ? "bg-surface-sunken text-ink" : "text-ink-3 hover:text-ink")}>
                        {v}
                    </button>
                ))}
            </div>
            {view === "Collections" && <Collections />}
            {view === "IPOs, funds & stocks" && <DiscoverPage />}
            {view === "Fund watchlist" && (
                <div className="max-w-2xl rounded-card bg-surface border border-line p-5 mb-6"><MutualFundsTab /></div>
            )}
            {view === "US stocks" && (
                <div className="max-w-2xl rounded-card bg-surface border border-line p-5 mb-6"><USStocksTab /></div>
            )}
        </>
    );
}

function Insights() {
    const { portfolio } = useInvestData();
    const details = useFundDetails(portfolio?.holdings);
    return (
        <div className="desk-cols">
            <div className="max-w-2xl space-y-5 mb-6">
                <PortfolioHealthCard showEmpty />
                <BenchmarkCard details={details} />
                <OverlapCard details={details} />
                <SectorCard holdings={portfolio?.holdings} />
            </div>
            <InvestmentPlanSection />
        </div>
    );
}

export default function InvestmentsPage({ view = "Investments", onNavigate }) {
    return (
        <div className="mb-10">
            {(view === "Investments" || view === "Explore") && <MarketTicker />}

            {view === "Investments" && <PortfolioTab />}
            {view === "SIPs" && (
                <div className="max-w-2xl rounded-card bg-surface border border-line p-5 mb-6"><SIPTracker /></div>
            )}
            {view === "Explore" && <Explore />}
            {view === "Investment Insights" && <Insights />}
            {view === "Future Twin" && <FutureTwin onOpenSips={() => onNavigate?.("SIPs")} />}
        </div>
    );
}
