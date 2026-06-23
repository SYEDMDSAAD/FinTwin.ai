import { Bell, LogOut, User, Settings, ChevronDown, Sun, Moon } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import { useTheme } from "../context/ThemeContext";

// ─── shared design tokens (mirrors dashboard) ───────────────────────────────
const S = {
  card: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 16,
    backdropFilter: "blur(12px)",
  },
};

function Header({ notifications = [], scoreData }) {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const [showProfile, setShowProfile] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const profileRef = useRef(null);
  const notifRef = useRef(null);

  const userData = JSON.parse(localStorage.getItem("user")) || {};
  const fullName = userData.fullName || "User";
  const email = userData.email || "";
  const initial = fullName.charAt(0).toUpperCase();

  const greeting =
    new Date().getHours() < 12
      ? "Good Morning"
      : new Date().getHours() < 18
      ? "Good Afternoon"
      : "Good Evening";

  const logout = () => { localStorage.clear(); navigate("/login"); };

  useEffect(() => {
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfile(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifications(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const notifColor = (type) =>
    type === "danger" ? { bg: "rgba(248,113,113,0.07)", border: "rgba(248,113,113,0.2)", dot: "#f87171" }
    : type === "warning" ? { bg: "rgba(251,191,36,0.07)", border: "rgba(251,191,36,0.2)", dot: "#fbbf24" }
    : type === "success" ? { bg: "rgba(74,222,128,0.07)", border: "rgba(74,222,128,0.2)", dot: "#4ade80" }
    : { bg: "rgba(34,211,238,0.07)", border: "rgba(34,211,238,0.2)", dot: "#22d3ee" };

  const notifIcon = (type) =>
    type === "danger" ? "🚨" : type === "warning" ? "⚠️" : type === "success" ? "✅" : "💡";

  const score = scoreData?.score ?? 0;
  const scoreColor = score >= 80 ? "#4ade80" : score >= 60 ? "#fbbf24" : "#f87171";
  const scoreLabel = score >= 80 ? "Excellent" : score >= 60 ? "Good" : "Needs Improvement";

  return (
    <>
      <style>{`
        .hdr-btn { transition: all 0.2s ease; cursor: pointer; border: none; }
        .hdr-btn:hover { background: rgba(255,255,255,0.06) !important; }
        .hdr-dropdown { animation: dropIn 0.18s ease; }
        @keyframes dropIn { from { opacity:0; transform:translateY(-6px) } to { opacity:1; transform:translateY(0) } }
        .notif-item:hover { background: rgba(255,255,255,0.04) !important; }
        .profile-item { display:flex; align-items:center; gap:12px; width:100%; padding:12px 16px; background:none; border:none; color:#e2e8f0; font-size:13px; font-family:inherit; cursor:pointer; transition:background 0.15s; text-align:left; }
        .profile-item:hover { background: rgba(255,255,255,0.04); }
      `}</style>

      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        marginBottom: 24, fontFamily: "'DM Sans', system-ui, sans-serif",
        flexWrap: "wrap", gap: 12,
      }}>

        {/* ── LEFT: Greeting ── */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#4ade80", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 11, color: "rgba(74,222,128,0.8)", fontWeight: 600, letterSpacing: "0.06em" }}>LIVE</span>
            <span style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.04em" }}>
              {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </span>
          </div>

          <h1 style={{
            fontSize: "clamp(20px, 5vw, 28px)", fontWeight: 700, color: "#fff",
            letterSpacing: "-0.03em", lineHeight: 1.15,
          }}>
            {greeting},{" "}
            <span style={{ backgroundImage: "linear-gradient(135deg, #a78bfa, #22d3ee)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {fullName}
            </span>{" "}👋
          </h1>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#4ade80", background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 8, padding: "4px 10px" }}>
              Savings {scoreData?.savingsRatio ?? 0}%
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#a78bfa", background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 8, padding: "4px 10px" }}>
              Score {score}/100
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor, background: scoreColor + "18", border: `1px solid ${scoreColor}30`, borderRadius: 8, padding: "4px 10px" }}>
              {scoreLabel}
            </span>
          </div>
        </div>

        {/* ── RIGHT: Actions ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>

          {/* Theme toggle */}
          <button
            className="hdr-btn"
            onClick={toggleTheme}
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            style={{
              width: 42, height: 42, borderRadius: 12, display: "flex",
              alignItems: "center", justifyContent: "center",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {isDark
              ? <Sun size={17} color="rgba(251,191,36,0.8)" />
              : <Moon size={17} color="rgba(148,163,184,0.7)" />
            }
          </button>

          {/* Notifications */}
          <div style={{ position: "relative" }} ref={notifRef}>
            <button
              className="hdr-btn"
              onClick={() => { setShowNotifications(!showNotifications); setShowProfile(false); }}
              style={{
                width: 42, height: 42, borderRadius: 12, display: "flex",
                alignItems: "center", justifyContent: "center",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                position: "relative",
              }}
            >
              <Bell size={17} color="rgba(148,163,184,0.7)" />
              {notifications.length > 0 && (
                <span style={{
                  position: "absolute", top: 5, right: 5,
                  width: 14, height: 14, borderRadius: "50%",
                  background: "#f87171", border: "2px solid #080a0f",
                  fontSize: 8, fontWeight: 800, color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {notifications.length > 9 ? "9+" : notifications.length}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="hdr-dropdown" style={{
                position: "absolute", right: 0, top: "calc(100% + 10px)",
                width: "min(360px, calc(100vw - 32px))", background: "#0e1018",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 18, boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
                zIndex: 100, overflow: "hidden",
              }}>
                <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(148,163,184,0.6)", letterSpacing: "0.08em" }}>AI NOTIFICATIONS</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#f87171", background: "rgba(248,113,113,0.12)", borderRadius: 6, padding: "2px 8px" }}>{notifications.length} Alerts</span>
                </div>
                <div style={{ maxHeight: 320, overflowY: "auto", padding: "8px" }}>
                  {notifications.length > 0 ? notifications.map((n, i) => {
                    const c = notifColor(n.type);
                    return (
                      <div key={i} className="notif-item" style={{
                        display: "flex", gap: 10, padding: "10px 12px", borderRadius: 10,
                        background: c.bg, border: "1px solid " + c.border,
                        borderLeft: `3px solid ${c.dot}`, marginBottom: 6, cursor: "default",
                      }}>
                        <span style={{ fontSize: 14, lineHeight: 1.5 }}>{notifIcon(n.type)}</span>
                        <p style={{ fontSize: 12, color: "#e2e8f0", lineHeight: 1.5, margin: 0 }}>{n.message}</p>
                      </div>
                    );
                  }) : (
                    <p style={{ fontSize: 12, color: "var(--text-dim)", padding: "12px 8px", textAlign: "center" }}>No notifications</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Profile */}
          <div style={{ position: "relative" }} ref={profileRef}>
            <button
              className="hdr-btn"
              onClick={() => { setShowProfile(!showProfile); setShowNotifications(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12, padding: "6px 10px 6px 6px",
              }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700, color: "#fff",
              }}>{initial}</div>
              <div className="hidden sm:block" style={{ textAlign: "left" }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", lineHeight: 1, margin: 0 }}>{fullName}</p>
                <p style={{ fontSize: 10, color: "rgba(148,163,184,0.5)", margin: "2px 0 0", lineHeight: 1 }}>FinTwin User</p>
              </div>
              <ChevronDown size={13} color="rgba(148,163,184,0.5)" />
            </button>

            {showProfile && (
              <div className="hdr-dropdown" style={{
                position: "absolute", right: 0, top: "calc(100% + 10px)",
                width: "min(240px, calc(100vw - 32px))", background: "#0e1018",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
                zIndex: 100, overflow: "hidden",
              }}>
                <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", margin: 0 }}>{fullName}</p>
                  <p style={{ fontSize: 11, color: "rgba(148,163,184,0.5)", margin: "3px 0 0" }}>{email}</p>
                </div>
                <div style={{ padding: "6px" }}>
                  <button className="profile-item" onClick={() => { setShowProfile(false); navigate("/profile"); }}>
                    <User size={14} color="rgba(148,163,184,0.6)" /> Profile
                  </button>
                  <button className="profile-item">
                    <Settings size={14} color="rgba(148,163,184,0.6)" /> Settings
                  </button>
                  <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "4px 0" }} />
                  <button className="profile-item" onClick={logout} style={{ color: "#f87171" }}>
                    <LogOut size={14} color="#f87171" /> Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default Header;