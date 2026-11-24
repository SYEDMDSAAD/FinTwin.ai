import { Sparkles } from "lucide-react";
import { useSpendGuardEnabled } from "../hooks/useSpendGuard";
import { COPILOT, tabOf, sectionsOf } from "../constants/navigation";

/*
 * The top of every screen: where you are, the few sections of this tab, and
 * the copilot one tap away. On a phone the chips scroll sideways rather than
 * wrapping into a second row.
 */
export default function TabHeader({ activeSection, navigateTo }) {
    const guardOn = useSpendGuardEnabled();
    const tab = tabOf(activeSection);
    const sections = tab ? sectionsOf(tab, guardOn) : [];
    const title = tab ? tab.label : "Copilot";

    return (
        <header className="mb-5">
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-[22px] md:text-[26px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                    {title}
                </h1>
                {activeSection !== COPILOT && (
                    <button
                        type="button"
                        onClick={() => navigateTo(COPILOT)}
                        className="md:hidden inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold border border-violet-500/30 bg-violet-500/10 text-violet-500"
                    >
                        <Sparkles size={14} aria-hidden /> Ask AI
                    </button>
                )}
            </div>

            {sections.length > 1 && (
                <div
                    role="tablist"
                    aria-label={`${title} sections`}
                    className="mt-3 -mx-4 px-4 md:mx-0 md:px-0 flex gap-2 overflow-x-auto"
                    style={{ scrollbarWidth: "none" }}
                >
                    {sections.map((s) => {
                        const active = s.name === activeSection;
                        return (
                            <button
                                key={s.name}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                onClick={() => navigateTo(s.name)}
                                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium border transition-colors ${
                                    active
                                        ? "bg-violet-600 border-violet-600"
                                        : "hover:border-violet-400/50"
                                }`}
                                style={active ? { color: "#fff" } : { borderColor: "var(--border-card)", color: "var(--text-secondary)", background: "var(--bg-card)" }}
                            >
                                {s.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </header>
    );
}
