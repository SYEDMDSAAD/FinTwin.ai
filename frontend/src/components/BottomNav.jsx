import { useState } from "react";
import {
    LayoutDashboard, Wallet, MessageSquare, Target, MoreHorizontal,
    BarChart3, Brain, Zap, ShieldCheck, Landmark, TrendingUp,
    Upload, FileText, Settings, X, Shield, FileInput,
} from "lucide-react";

const PRIMARY_TABS = [
    { name: "Dashboard",   icon: LayoutDashboard },
    { name: "Transactions",icon: Wallet },
    { name: "AI Copilot",  icon: MessageSquare },
    { name: "Goals Planner",icon: Target },
];

const MORE_ITEMS = [
    { name: "Analytics",         icon: BarChart3 },
    { name: "AI Intelligence",   icon: Brain },
    { name: "AI Spending Coach", icon: Zap },
    { name: "Budgeting",         icon: ShieldCheck },
    { name: "Net Worth",         icon: Landmark },
    { name: "Investments",       icon: TrendingUp },
    { name: "Insurance",         icon: Shield },
    { name: "OCR Uploads",       icon: Upload },
    { name: "Imports",           icon: FileInput },
    { name: "Executive Reports", icon: FileText },
    { name: "Settings",          icon: Settings },
];

function BottomNav({ activeSection, setActiveSection }) {
    const [showMore, setShowMore] = useState(false);

    const select = (name) => {
        setActiveSection(name);
        setShowMore(false);
    };

    return (
        <>
            {/* Backdrop */}
            {showMore && (
                <div
                    className="fixed inset-0 bg-black/60 z-40 md:hidden"
                    onClick={() => setShowMore(false)}
                />
            )}

            {/* Slide-up "More" drawer */}
            <div className={`
                fixed left-0 right-0 z-50 md:hidden
                bg-[#0d0f17] border-t border-white/[0.07] rounded-t-2xl
                transition-transform duration-300 ease-out
                ${showMore ? "translate-y-0 bottom-16" : "translate-y-full bottom-16"}
            `}>
                <div className="flex justify-between items-center px-5 py-3 border-b border-white/[0.05]">
                    <span className="text-[10px] font-semibold tracking-widest text-zinc-500 uppercase">All Sections</span>
                    <button onClick={() => setShowMore(false)} className="p-1">
                        <X size={15} color="rgba(148,163,184,0.5)" />
                    </button>
                </div>
                <div className="grid grid-cols-3 gap-2 p-4 pb-6">
                    {MORE_ITEMS.map(({ name, icon: Icon }) => {
                        const active = activeSection === name;
                        return (
                            <button
                                key={name}
                                onClick={() => select(name)}
                                className={`
                                    flex flex-col items-center gap-1.5 p-3 rounded-xl
                                    border transition-all duration-150
                                    ${active
                                        ? "bg-violet-500/15 border-violet-500/25"
                                        : "bg-white/[0.03] border-white/[0.06] active:bg-white/[0.07]"}
                                `}
                            >
                                <Icon size={18} color={active ? "#a78bfa" : "rgba(148,163,184,0.55)"} />
                                <span className={`text-[10px] text-center leading-tight ${active ? "text-violet-300" : "text-zinc-500"}`}>
                                    {name}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Bottom tab bar */}
            <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden
                bg-[#090B11]/95 backdrop-blur-xl
                border-t border-white/[0.06]
                flex items-center h-16
                px-1
                safe-area-bottom
            ">
                {PRIMARY_TABS.map(({ name, icon: Icon }) => {
                    const active = activeSection === name;
                    return (
                        <button
                            key={name}
                            onClick={() => select(name)}
                            className="flex-1 flex flex-col items-center justify-center gap-0.5 h-full"
                        >
                            <div className={`
                                w-9 h-8 rounded-xl flex items-center justify-center
                                transition-colors duration-150
                                ${active ? "bg-violet-500/20" : ""}
                            `}>
                                <Icon size={19} color={active ? "#a78bfa" : "rgba(148,163,184,0.5)"} />
                            </div>
                            <span className={`text-[9.5px] font-medium transition-colors duration-150 ${active ? "text-violet-300" : "text-zinc-500"}`}>
                                {name.split(" ")[0]}
                            </span>
                        </button>
                    );
                })}

                {/* More */}
                <button
                    onClick={() => setShowMore(!showMore)}
                    className="flex-1 flex flex-col items-center justify-center gap-0.5 h-full"
                >
                    <div className={`w-9 h-8 rounded-xl flex items-center justify-center transition-colors duration-150 ${showMore ? "bg-violet-500/20" : ""}`}>
                        <MoreHorizontal size={19} color={showMore ? "#a78bfa" : "rgba(148,163,184,0.5)"} />
                    </div>
                    <span className={`text-[9.5px] font-medium transition-colors duration-150 ${showMore ? "text-violet-300" : "text-zinc-500"}`}>More</span>
                </button>
            </div>
        </>
    );
}

export default BottomNav;
