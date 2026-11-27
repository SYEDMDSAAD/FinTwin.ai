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
    const pageLabel = sections.length > 1 ? sections.find((s) => s.name === activeSection)?.label : null;

    return (
        <header className="mb-6 pt-1">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    {/* Wide screens: the tab small above, the page itself as the title */}
                    {pageLabel && (
                        <p className="hidden lg:block text-small font-semibold text-accent mb-0.5">{title}</p>
                    )}
                    <h1 className="text-[28px] leading-tight font-[650] tracking-[-0.03em] md:text-[30px] lg:text-[32px] text-ink min-w-0 truncate">
                        <span className={pageLabel ? "lg:hidden" : ""}>{title}</span>
                        {pageLabel && <span className="hidden lg:inline">{pageLabel}</span>}
                    </h1>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {activeSection !== COPILOT && (
                        <button
                            type="button"
                            onClick={() => navigateTo(COPILOT)}
                            aria-label="Ask AI"
                            className="md:hidden w-10 h-10 rounded-full flex items-center justify-center text-accent hover:bg-surface transition-colors"
                        >
                            <Sparkles size={20} aria-hidden />
                        </button>
                    )}
                    {/* Alerts and account: on every screen, not just Home */}
                    <Header notifications={notifications} onSettings={() => navigateTo("Settings")} />
                </div>
            </div>

            {sections.length > 1 && (
                <div
                    role="tablist"
                    aria-label={`${title} sections`}
                    className="mt-4 -mx-4 px-4 md:mx-0 md:px-0 flex gap-1 overflow-x-auto lg:hidden"
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
                                className={`shrink-0 h-9 rounded-full px-4 text-small font-medium transition-colors ${
                                    active
                                        ? "bg-ink text-surface"
                                        : "text-ink-2 hover:bg-surface"
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
