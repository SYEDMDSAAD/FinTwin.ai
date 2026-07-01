import { useState, memo, useMemo } from "react";
import {
    LayoutDashboard,
    Wallet,
    Upload,
    Brain,
    BarChart3,
    FileText,
    Settings,
    TrendingUp,
    Target,
    Landmark,
    MessageSquare,
    Zap,
    ShieldCheck,
    Shield,
    FileInput,
} from "lucide-react";

const NAV_GROUPS = [
    {
        label: "OVERVIEW",
        items: [
            { name: "Dashboard",    icon: <LayoutDashboard size={17} /> },
            { name: "Analytics",    icon: <BarChart3 size={17} /> },
            { name: "Transactions", icon: <Wallet size={17} /> },
        ],
    },
    {
        label: "AI SUITE",
        items: [
            { name: "AI Intelligence",    icon: <Brain size={17} /> },
            { name: "AI Copilot",         icon: <MessageSquare size={17} /> },
            { name: "AI Spending Coach",  icon: <Zap size={17} /> },
        ],
    },
    {
        label: "FINANCE",
        items: [
            { name: "Goals Planner", icon: <Target size={17} /> },
            { name: "Budgeting",     icon: <ShieldCheck size={17} /> },
            { name: "Net Worth",     icon: <Landmark size={17} /> },
            { name: "Investments",   icon: <TrendingUp size={17} /> },
            { name: "Insurance",     icon: <Shield size={17} /> },
        ],
    },
    {
        label: "SYSTEM",
        items: [
            { name: "OCR Uploads",        icon: <Upload size={17} /> },
            { name: "Imports",            icon: <FileInput size={17} /> },
            { name: "Executive Reports",  icon: <FileText size={17} /> },
            { name: "Settings",           icon: <Settings size={17} /> },
        ],
    },
];

const NavItem = memo(function NavItem({ item, active, expanded, onClick }) {
    return (
        <div
            onClick={onClick}
            title={!expanded ? item.name : undefined}
            className={`
                relative flex items-center gap-3 px-3 py-2.5
                rounded-xl cursor-pointer select-none
                transition-all duration-150 mb-0.5 group
                ${active
                    ? "bg-violet-500/10 border border-violet-500/20 text-white"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100 border border-transparent"
                }
            `}
        >
            {/* Active bar */}
            <div className={`
                absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full
                bg-gradient-to-b from-violet-400 to-cyan-400
                transition-opacity duration-150
                ${active ? "opacity-100" : "opacity-0"}
            `} />

            {/* Icon */}
            <div className={`
                w-8 h-8 rounded-lg flex items-center justify-center shrink-0
                transition-colors duration-150
                ${active
                    ? "bg-violet-500/15 text-violet-300"
                    : "bg-white/[0.04] text-zinc-400 group-hover:bg-white/[0.07] group-hover:text-zinc-200"
                }
            `}>
                {item.icon}
            </div>

            {/* Label */}
            {expanded && (
                <span className="text-[13px] font-medium leading-none whitespace-nowrap overflow-hidden">
                    {item.name}
                </span>
            )}

            {/* Tooltip for collapsed */}
            {!expanded && (
                <div className="
                    pointer-events-none absolute left-full ml-3 z-50
                    px-2.5 py-1.5 rounded-lg text-xs font-medium
                    bg-[#1a1d27] border border-white/10 text-zinc-100
                    shadow-xl whitespace-nowrap
                    opacity-0 group-hover:opacity-100
                    translate-x-1 group-hover:translate-x-0
                    transition-all duration-150
                ">
                    {item.name}
                </div>
            )}
        </div>
    );
});

function Sidebar({ activeSection, setActiveSection }) {
    const [expanded, setExpanded] = useState(false);

    // Pre-build stable click handlers so NavItem (memo'd) never re-renders from inline arrows
    const clickHandlers = useMemo(() => {
        const h = {};
        NAV_GROUPS.forEach(g => g.items.forEach(item => {
            h[item.name] = () => setActiveSection(item.name);
        }));
        return h;
    }, [setActiveSection]);

    const triggerAnimation = () => {
        document.body.classList.add("sidebar-animating");
        setTimeout(() => document.body.classList.remove("sidebar-animating"), 300);
    };

    return (
        <div
            onMouseEnter={() => { triggerAnimation(); setExpanded(true); }}
            onMouseLeave={() => { triggerAnimation(); setExpanded(false); }}
            className={`
                relative min-h-screen hidden md:flex flex-col shrink-0
                bg-[#090B11] border-r border-white/[0.05]
                transition-all duration-250 ease-out overflow-hidden
                ${expanded ? "w-[220px]" : "w-[68px]"}
            `}
            style={{ background: "var(--bg-sidebar)", borderColor: "var(--border-sidebar)" }}
        >
            {/* Subtle left-edge gradient */}
            <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/[0.05] to-transparent" />

            {/* ── Logo ── */}
            <div className="flex items-center gap-3 px-3.5 py-5 shrink-0">
                <div className="
                    w-9 h-9 rounded-xl shrink-0
                    bg-gradient-to-br from-violet-500 to-cyan-400
                    flex items-center justify-center
                    text-white text-sm font-black tracking-tight
                    shadow-lg shadow-violet-500/20
                ">
                    F
                </div>
                {expanded && (
                    <div className="overflow-hidden">
                        <p className="text-[13px] font-bold text-white leading-none tracking-tight">FinTwin AI</p>
                        <p className="text-[10px] text-zinc-500 leading-none mt-1 tracking-widest">FINANCIAL OS</p>
                    </div>
                )}
            </div>

            {/* ── Nav ── */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
                {NAV_GROUPS.map((group) => (
                    <div key={group.label} className="mb-5">
                        {expanded && (
                            <p className="text-[10px] font-semibold tracking-widest text-zinc-600 px-3 mb-1.5 uppercase">
                                {group.label}
                            </p>
                        )}
                        {!expanded && <div className="h-px bg-white/[0.04] mx-2 mb-2" />}
                        {group.items.map((item) => (
                            <NavItem
                                key={item.name}
                                item={item}
                                active={activeSection === item.name}
                                expanded={expanded}
                                onClick={clickHandlers[item.name]}
                            />
                        ))}
                    </div>
                ))}
            </div>

            {/* ── Bottom version ── */}
            {expanded && (
                <div className="px-4 py-4 border-t border-white/[0.05] shrink-0">
                    <p className="text-[10px] text-zinc-600 tracking-widest">v1.0.0 · BETA</p>
                </div>
            )}
        </div>
    );
}

export default memo(Sidebar);
