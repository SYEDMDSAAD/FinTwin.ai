import { Sparkles } from "lucide-react";
import { useSpendGuardEnabled } from "../hooks/useSpendGuard";
import { COPILOT, tabOf, sectionsOf } from "../constants/navigation";
import Header from "./Header";

/*
 * The top of every screen: where you are, the few sections of this tab, and
 * the copilot one tap away. On a phone the chips scroll sideways rather than
 * wrapping into a second row.
 */
export default function TabHeader({ activeSection, navigateTo, notifications = [] }) {
    const guardOn = useSpendGuardEnabled();
    const tab = tabOf(activeSection);
    const sections = tab ? sectionsOf(tab, guardOn) : [];
    const title = tab ? tab.label : "Copilot";

    return (
        <header className="mb-5">
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-title md:text-[26px] text-ink min-w-0 truncate">
                    {title}
                </h1>
                <div className="flex items-center gap-2 shrink-0">
                {activeSection !== COPILOT && (
                    <button
                        type="button"
                        onClick={() => navigateTo(COPILOT)}
                        className="md:hidden inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-small font-semibold bg-accent-soft text-accent"
                    >
                        <Sparkles size={14} aria-hidden /> Ask AI
                    </button>
                )}
                    {/* Theme, alerts and account: on every screen, not just Home */}
                    <Header compact notifications={notifications} onSettings={() => navigateTo("Settings")} />
                </div>
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
                                className={`shrink-0 rounded-full px-3.5 py-1.5 text-small font-medium border transition-colors ${
                                    active
                                        ? "bg-accent-strong border-transparent text-accent-on"
                                        : "bg-surface border-line text-ink-2 hover:border-line-strong"
                                }`}
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
