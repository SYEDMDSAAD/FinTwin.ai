import { memo } from "react";
import { ScanLine, Sparkles } from "lucide-react";
import { useSpendGuardEnabled } from "../hooks/useSpendGuard";
import { TABS, COPILOT, SPEND_GUARD, tabOf, entryOf } from "../constants/navigation";

/*
 * Desktop navigation: the same four tabs as the phone's bottom bar, so the app
 * has one map everywhere. Sections inside a tab are chosen in the page header
 * (TabHeader), not here, which keeps this to six things at most.
 */
function Sidebar({ activeSection, setActiveSection }) {
    const guardOn = useSpendGuardEnabled();
    const current = tabOf(activeSection);

    return (
        <nav
            aria-label="Main"
            className="relative hidden md:flex flex-col shrink-0 w-[216px] min-h-screen border-r"
            style={{ background: "var(--bg-sidebar)", borderColor: "var(--border-sidebar)" }}
        >
            <div className="flex items-center gap-3 px-5 pt-6 pb-5">
                <div className="w-9 h-9 rounded-xl shrink-0 bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center text-white text-sm font-black shadow-lg shadow-violet-500/20">
                    F
                </div>
                <p className="text-[15px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>FinTwin AI</p>
            </div>

            {guardOn && (
                <div className="px-3 pb-4">
                    <button
                        type="button"
                        onClick={() => setActiveSection(SPEND_GUARD)}
                        aria-current={activeSection === SPEND_GUARD ? "page" : undefined}
                        className="w-full flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-semibold bg-gradient-to-br from-violet-500 to-violet-700 shadow-[0_4px_14px_rgba(139,92,246,0.35)] hover:brightness-110 transition"
                        style={{ color: "#fff" }}
                    >
                        <ScanLine size={16} aria-hidden /> Scan &amp; pay
                    </button>
                </div>
            )}

            <ul className="flex-1 px-3 space-y-1">
                {TABS.map((tab) => {
                    const active = current?.id === tab.id;
                    const Icon = tab.icon;
                    return (
                        <li key={tab.id}>
                            <button
                                type="button"
                                onClick={() => setActiveSection(entryOf(tab, guardOn))}
                                aria-current={active ? "page" : undefined}
                                className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors ${
                                    active ? "bg-violet-500/10" : "hover:bg-violet-500/[0.06]"
                                }`}
                                style={{ color: active ? undefined : "var(--text-secondary)" }}
                            >
                                <Icon size={18} aria-hidden className={active ? "text-violet-500" : ""} />
                                <span className={active ? "text-violet-500 font-semibold" : ""}>{tab.label}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>

            <div className="px-3 pb-5">
                <button
                    type="button"
                    onClick={() => setActiveSection(COPILOT)}
                    aria-current={activeSection === COPILOT ? "page" : undefined}
                    className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium border transition-colors ${
                        activeSection === COPILOT ? "border-violet-500/40 bg-violet-500/10" : "hover:bg-violet-500/[0.06]"
                    }`}
                    style={{ borderColor: activeSection === COPILOT ? undefined : "var(--border-card)", color: "var(--text-secondary)" }}
                >
                    <Sparkles size={18} aria-hidden className="text-violet-500" /> Ask Copilot
                </button>
            </div>
        </nav>
    );
}

export default memo(Sidebar);
