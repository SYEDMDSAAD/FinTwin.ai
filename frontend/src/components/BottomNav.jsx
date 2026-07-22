import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { LayoutDashboard, Wallet, LayoutGrid } from "lucide-react";

const PRIMARY_TABS = [
    { name: "Dashboard",    icon: LayoutDashboard },
    { name: "Transactions", icon: Wallet },
    { name: "Services",     icon: LayoutGrid },
];

function BottomNav({ activeSection, setActiveSection }) {
    const [isLight, setIsLight] = useState(
        () => document.documentElement.dataset.theme === "light"
    );

    useEffect(() => {
        const obs = new MutationObserver(() => {
            setIsLight(document.documentElement.dataset.theme === "light");
        });
        obs.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-theme"],
        });
        return () => obs.disconnect();
    }, []);

    const dimColor    = isLight ? "rgba(30,41,59,0.45)"  : "rgba(148,163,184,0.50)";
    const activeColor = "#a78bfa";

    // Section names that should light up the "Services" tab even though they're
    // not the tab's own activeSection value (everything except Dashboard/Transactions).
    const isServicesActive = activeSection !== "Dashboard" && activeSection !== "Transactions";

    // Tab bar is portalled to document.body so it is never trapped inside an
    // overflow:hidden ancestor (iOS Safari position:fixed fix).
    const nav = (
        <div
            style={{
                position: "fixed",
                bottom: 0, left: 0, right: 0,
                zIndex: 60,
                display: "flex",
                alignItems: "center",
                height: 64,
                paddingLeft: 4,
                paddingRight: 4,
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
                background: isLight ? "#ffffff" : "#090b11",
                borderTop: `1px solid ${isLight ? "rgba(15,23,42,0.07)" : "rgba(255,255,255,0.05)"}`,
            }}
        >
            {PRIMARY_TABS.map(({ name, icon: Icon }) => {
                const active = name === "Services" ? isServicesActive : activeSection === name;
                return (
                    <button
                        key={name}
                        onClick={() => setActiveSection(name)}
                        style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 2,
                            height: "100%",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontFamily: "inherit",
                        }}
                    >
                        <div style={{
                            width: 36, height: 32, borderRadius: 10,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: active ? "rgba(167,139,250,0.15)" : "transparent",
                            transition: "background 0.15s",
                        }}>
                            <Icon size={19} color={active ? activeColor : dimColor} />
                        </div>
                        <span style={{
                            fontSize: 10.5,
                            fontWeight: active ? 600 : 400,
                            color: active ? activeColor : (isLight ? "rgba(51,65,85,0.55)" : "rgba(148,163,184,0.50)"),
                            transition: "color 0.15s",
                        }}>
                            {name}
                        </span>
                    </button>
                );
            })}
        </div>
    );

    // Portal to document.body: escapes any overflow:hidden ancestors
    // so position:fixed works correctly on iOS Safari when page scrolls.
    // The md:hidden wrapper ensures this never shows on desktop (≥768px).
    return createPortal(
        <div className="md:hidden">{nav}</div>,
        document.body
    );
}

export default BottomNav;
