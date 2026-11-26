import { createPortal } from "react-dom";
import { ScanLine } from "lucide-react";
import { useSpendGuardEnabled } from "../hooks/useSpendGuard";
import { TABS, SPEND_GUARD, tabOf, entryOf } from "../constants/navigation";

/*
 * The phone's tab bar: the same four tabs as the desktop sidebar. Spend Guard
 * is used at the shop counter, so when it's on for this user its scanner sits
 * in the middle, one tap from anywhere.
 */
function BottomNav({ activeSection, setActiveSection }) {
    const guardOn = useSpendGuardEnabled();
    const current = tabOf(activeSection);
    const scanning = activeSection === SPEND_GUARD;

    const tabButton = (tab) => {
        const Icon = tab.icon;
        const active = current?.id === tab.id && !scanning;
        return (
            <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(entryOf(tab, guardOn))}
                aria-current={active ? "page" : undefined}
                className="flex-1 h-full flex flex-col items-center justify-center gap-0.5"
            >
                <Icon size={22} strokeWidth={active ? 2.2 : 1.8} aria-hidden className={active ? "text-ink" : "text-ink-3"} />
                <span className={`text-[11px] ${active ? "font-semibold text-ink" : "font-medium text-ink-3"}`}>
                    {tab.label}
                </span>
            </button>
        );
    };

    const nav = (
        <nav
            aria-label="Main"
            className="fixed inset-x-0 bottom-0 z-[60] flex items-stretch border-t px-1"
            style={{
                height: "calc(64px + env(safe-area-inset-bottom, 0px))",
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
                background: "var(--bg-sidebar)",
                borderColor: "var(--border-sidebar)",
            }}
        >
            {TABS.slice(0, 2).map(tabButton)}
            {guardOn && (
                <div className="flex-1 flex items-start justify-center">
                    <button
                        type="button"
                        onClick={() => setActiveSection(SPEND_GUARD)}
                        aria-label="Scan and pay"
                        aria-current={scanning ? "page" : undefined}
                        className="mt-2 w-12 h-12 rounded-full flex items-center justify-center bg-accent-strong text-accent-on focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                    >
                        <ScanLine size={24} aria-hidden />
                    </button>
                </div>
            )}
            {TABS.slice(2).map(tabButton)}
        </nav>
    );

    // Portalled to <body> so no overflow:hidden ancestor traps position:fixed
    // (iOS Safari). md:hidden keeps it off desktop.
    return createPortal(<div className="md:hidden">{nav}</div>, document.body);
}

export default BottomNav;
