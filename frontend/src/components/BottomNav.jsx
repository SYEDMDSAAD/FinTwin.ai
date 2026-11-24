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
                <Icon size={21} aria-hidden className={active ? "text-violet-500" : ""}
                      style={active ? undefined : { color: "var(--text-dim)" }} />
                <span className={`text-[11px] ${active ? "font-semibold text-violet-500" : ""}`}
                      style={active ? undefined : { color: "var(--text-dim)" }}>
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
                        className="-mt-5 w-14 h-14 rounded-full flex items-center justify-center bg-gradient-to-br from-violet-500 to-violet-700 shadow-[0_6px_18px_rgba(124,58,237,0.45)] ring-4"
                        style={{ color: "#fff", "--tw-ring-color": "var(--bg-sidebar)" }}
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
