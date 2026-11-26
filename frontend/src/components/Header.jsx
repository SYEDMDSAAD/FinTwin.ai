import { Bell, LogOut, User, Settings, Moon, Sun, LifeBuoy, AlertTriangle, AlertOctagon, CheckCircle2, Info } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { useCurrentUser } from "../context/AuthContext";
import { cx } from "./ui";

/*
 * The top-right of every screen: alerts and the account menu. Theme lives in
 * the account menu (and Settings), not as a permanent button.
 */

const NOTE = {
    danger:  { icon: AlertOctagon, tone: "text-bad bg-bad-soft" },
    warning: { icon: AlertTriangle, tone: "text-warn bg-warn-soft" },
    success: { icon: CheckCircle2, tone: "text-good bg-good-soft" },
    info:    { icon: Info, tone: "text-info bg-info-soft" },
};

function IconButton({ label, onClick, children }) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className="relative w-10 h-10 rounded-full flex items-center justify-center text-ink-2 hover:bg-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
            {children}
        </button>
    );
}

function Menu({ children, width = "w-[min(340px,calc(100vw-32px))]" }) {
    return (
        <div className={cx("fixed right-4 top-16 z-[200] rounded-card border border-line bg-surface-raised shadow-raised overflow-hidden", width)}>
            {children}
        </div>
    );
}

function MenuItem({ icon: Icon, onClick, danger, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cx("w-full flex items-center gap-3 px-4 py-3 text-body text-left hover:bg-surface-hover", danger ? "text-bad" : "text-ink")}
        >
            <Icon size={18} aria-hidden className={danger ? "text-bad" : "text-ink-3"} />
            {children}
        </button>
    );
}

function Header({ notifications = [], onSettings }) {
    const navigate = useNavigate();
    const { isDark, toggleTheme } = useTheme();
    const [open, setOpen] = useState(null); // "alerts" | "account" | null
    const ref = useRef(null);

    const user = useCurrentUser();
    const fullName = user.fullName || "You";
    const initial = fullName.charAt(0).toUpperCase();

    useEffect(() => {
        const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(null); };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, []);

    const logout = () => {
        const wasDemo = user.role === "DEMO";
        // Keep the anonymous visitor id, or a returning visitor counts as new
        const visitor = localStorage.getItem("fintwin_visitor");
        localStorage.clear();
        if (visitor) localStorage.setItem("fintwin_visitor", visitor);
        sessionStorage.removeItem("splashShown");
        // Leaving the demo goes back to the landing page, not to a login form
        navigate(wasDemo ? "/" : "/login");
    };

    const toggle = (which) => setOpen((o) => (o === which ? null : which));
    const count = notifications.length;

    return (
        <div ref={ref} className="flex items-center gap-1 shrink-0">
            <IconButton label={`Alerts (${count})`} onClick={() => toggle("alerts")}>
                <Bell size={20} aria-hidden />
                {count > 0 && (
                    <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-bad text-[10px] font-semibold leading-4 text-center text-accent-on num">
                        {count > 9 ? "9+" : count}
                    </span>
                )}
            </IconButton>

            <button
                type="button"
                aria-label="Account menu"
                onClick={() => toggle("account")}
                className="w-10 h-10 rounded-full flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
                <span className="w-8 h-8 rounded-full bg-accent-soft text-accent text-small font-semibold flex items-center justify-center">
                    {initial}
                </span>
            </button>

            {open === "alerts" && (
                <Menu>
                    <div className="px-4 pt-4 pb-2 flex items-baseline justify-between">
                        <p className="text-heading text-ink">Alerts</p>
                        <p className="text-caption text-ink-3">{count === 1 ? "1 alert" : `${count} alerts`}</p>
                    </div>
                    <ul className="max-h-[60vh] overflow-y-auto pb-2">
                        {count === 0 && <li className="px-4 py-6 text-small text-ink-3 text-center">You're all caught up.</li>}
                        {notifications.map((n, i) => {
                            const { icon: Icon, tone } = NOTE[n.type] || NOTE.info;
                            return (
                                <li key={i} className="flex gap-3 px-4 py-3 border-t border-line first:border-t-0">
                                    <span className={cx("shrink-0 w-8 h-8 rounded-full flex items-center justify-center", tone)}>
                                        <Icon size={16} aria-hidden />
                                    </span>
                                    <p className="text-small text-ink leading-snug">{n.message}</p>
                                </li>
                            );
                        })}
                    </ul>
                </Menu>
            )}

            {open === "account" && (
                <Menu width="w-[min(260px,calc(100vw-32px))]">
                    <div className="px-4 py-3 border-b border-line">
                        <p className="text-heading text-ink truncate">{fullName}</p>
                        {user.email && <p className="text-caption text-ink-3 truncate">{user.email}</p>}
                    </div>
                    <div className="py-1">
                        <MenuItem icon={User} onClick={() => { setOpen(null); navigate("/profile"); }}>Profile</MenuItem>
                        <MenuItem icon={Settings} onClick={() => { setOpen(null); onSettings?.(); }}>Settings</MenuItem>
                        <MenuItem icon={isDark ? Sun : Moon} onClick={toggleTheme}>{isDark ? "Light mode" : "Dark mode"}</MenuItem>
                        <MenuItem icon={LifeBuoy} onClick={() => { setOpen(null); window.dispatchEvent(new Event("openHelp")); }}>Help and feedback</MenuItem>
                    </div>
                    <div className="py-1 border-t border-line">
                        <MenuItem icon={LogOut} onClick={logout} danger>Log out</MenuItem>
                    </div>
                </Menu>
            )}
        </div>
    );
}

export default Header;
