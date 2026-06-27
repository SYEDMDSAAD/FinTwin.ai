import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
    LayoutDashboard, Wallet, MessageSquare, Target, MoreHorizontal,
    BarChart3, Brain, Zap, ShieldCheck, Landmark, TrendingUp,
    Upload, FileText, Settings, X, Shield, FileInput,
} from "lucide-react";

const PRIMARY_TABS = [
    { name: "Dashboard",    icon: LayoutDashboard },
    { name: "Transactions", icon: Wallet },
    { name: "AI Copilot",   icon: MessageSquare },
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

    const select = (name) => {
        setActiveSection(name);
        setShowMore(false);
    };

    const dimColor    = isLight ? "rgba(30,41,59,0.45)"  : "rgba(148,163,184,0.50)";
    const activeColor = "#a78bfa";

    // Tab bar and drawer are portalled to document.body so they are never
    // trapped inside an overflow:hidden ancestor (iOS Safari position:fixed fix).
    const nav = (
        <>
            {/* Backdrop */}
            {showMore && (
                <div
                    style={{
                        position: "fixed", inset: 0, zIndex: 55,
                        background: isLight ? "rgba(15,23,42,0.35)" : "rgba(0,0,0,0.60)",
                    }}
                    onClick={() => setShowMore(false)}
                />
            )}

            {/* Slide-up "More" drawer */}
            <div
                style={{
                    position: "fixed",
                    left: 0, right: 0,
                    bottom: 64, // sits just above tab bar
                    zIndex: 60,
                    maxHeight: "65vh",
                    display: "flex",
                    flexDirection: "column",
                    background: isLight ? "#ffffff" : "#0d0f17",
                    borderTop: `1px solid ${isLight ? "rgba(15,23,42,0.09)" : "rgba(255,255,255,0.06)"}`,
                    borderRadius: "18px 18px 0 0",
                    boxShadow: isLight
                        ? "0 -8px 32px rgba(15,23,42,0.10), 0 -2px 8px rgba(109,40,217,0.06)"
                        : "0 -4px 24px rgba(0,0,0,0.40)",
                    // Slide animation via transform + visibility
                    transform: showMore ? "translateY(0)" : "translateY(110%)",
                    visibility: showMore ? "visible" : "hidden",
                    transition: "transform 0.3s ease-out, visibility 0.3s",
                }}
            >
                {/* Drawer header */}
                <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 20px",
                    borderBottom: `1px solid ${isLight ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.05)"}`,
                    flexShrink: 0,
                }}>
                    <span style={{
                        fontSize: 10, fontWeight: 700,
                        letterSpacing: "0.10em",
                        color: isLight ? "rgba(51,65,85,0.65)" : "rgba(148,163,184,0.50)",
                        textTransform: "uppercase",
                    }}>
                        All Sections
                    </span>
                    <button
                        onClick={() => setShowMore(false)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" }}
                    >
                        <X size={15} color={isLight ? "rgba(30,41,59,0.40)" : "rgba(148,163,184,0.40)"} />
                    </button>
                </div>

                {/* Section grid */}
                <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 8,
                    padding: 16,
                    paddingBottom: 24,
                    overflowY: "auto",
                    overscrollBehavior: "contain",
                }}>
                    {MORE_ITEMS.map(({ name, icon: Icon }) => {
                        const active = activeSection === name;
                        return (
                            <button
                                key={name}
                                onClick={() => select(name)}
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "12px 8px",
                                    borderRadius: 12,
                                    border: `1px solid ${active
                                        ? "rgba(167,139,250,0.30)"
                                        : isLight ? "rgba(15,23,42,0.09)" : "rgba(255,255,255,0.06)"}`,
                                    background: active
                                        ? "rgba(167,139,250,0.12)"
                                        : isLight ? "rgba(15,23,42,0.03)" : "rgba(255,255,255,0.03)",
                                    cursor: "pointer",
                                    fontFamily: "inherit",
                                    transition: "all 0.15s",
                                }}
                            >
                                <Icon size={18} color={active ? activeColor : dimColor} />
                                <span style={{
                                    fontSize: 10,
                                    textAlign: "center",
                                    lineHeight: 1.25,
                                    color: active ? activeColor : (isLight ? "rgba(51,65,85,0.65)" : "rgba(148,163,184,0.50)"),
                                    fontWeight: active ? 600 : 400,
                                }}>
                                    {name}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Bottom tab bar — fully opaque so hidden drawer never bleeds through */}
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
                    const active = activeSection === name;
                    return (
                        <button
                            key={name}
                            onClick={() => select(name)}
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
                                fontSize: 9.5,
                                fontWeight: active ? 600 : 400,
                                color: active ? activeColor : (isLight ? "rgba(51,65,85,0.55)" : "rgba(148,163,184,0.50)"),
                                transition: "color 0.15s",
                            }}>
                                {name.split(" ")[0]}
                            </span>
                        </button>
                    );
                })}

                {/* More */}
                <button
                    onClick={() => setShowMore(!showMore)}
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
                        background: showMore ? "rgba(167,139,250,0.15)" : "transparent",
                        transition: "background 0.15s",
                    }}>
                        <MoreHorizontal size={19} color={showMore ? activeColor : dimColor} />
                    </div>
                    <span style={{
                        fontSize: 9.5,
                        fontWeight: showMore ? 600 : 400,
                        color: showMore ? activeColor : (isLight ? "rgba(51,65,85,0.55)" : "rgba(148,163,184,0.50)"),
                        transition: "color 0.15s",
                    }}>
                        More
                    </span>
                </button>
            </div>
        </>
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
