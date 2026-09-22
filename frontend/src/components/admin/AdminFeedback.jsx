import { useCallback, useEffect, useState } from "react";
import { Star, RefreshCw, ChevronDown, ChevronRight, MessageSquareHeart, Search } from "lucide-react";
import toast from "react-hot-toast";
import API from "../../services/api";

// Beta feedback from the About App page, one row per user who sent any, with
// every submission they made shown in full when the row is opened.

const fmt = (dt) =>
    dt ? new Date(dt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const muted = "rgba(148,163,184,0.6)";
const faint = "rgba(148,163,184,0.45)";
const RATING_COLOR = { 1: "#f87171", 2: "#fb923c", 3: "#fbbf24", 4: "#a3e635", 5: "#4ade80" };

function Stars({ value, size = 13 }) {
    if (!value) return <span style={{ color: faint, fontSize: 12 }}>—</span>;
    return (
        <span aria-label={`${value} out of 5`} style={{ display: "inline-flex", gap: 1 }}>
            {[1, 2, 3, 4, 5].map(n => (
                <Star key={n} size={size} aria-hidden color={n <= value ? "#fbbf24" : "rgba(148,163,184,0.25)"} fill={n <= value ? "#fbbf24" : "none"} />
            ))}
        </span>
    );
}

function Answer({ title, children }) {
    return (
        <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: faint, marginBottom: 5 }}>{title}</div>
            {children}
        </div>
    );
}

function Entry({ f }) {
    return (
        <div style={{ padding: 16, borderRadius: 12, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", display: "grid", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Stars value={f.rating} size={15} />
                {f.rating && <span style={{ fontSize: 12, fontWeight: 700, color: RATING_COLOR[f.rating] }}>{f.rating}/5</span>}
                <span style={{ marginLeft: "auto", fontSize: 11, color: faint }}>{fmt(f.submittedAt)}</span>
            </div>
            <Answer title="MOST USEFUL">
                {f.useful?.length ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {f.useful.map(u => <span key={u} className="badge b-admin">{u}</span>)}
                    </div>
                ) : <span style={{ fontSize: 12, color: faint }}>None picked</span>}
            </Answer>
            <Answer title="WHAT TO IMPROVE">
                <div style={{ fontSize: 13, lineHeight: 1.7, color: f.improve ? "#e2e8f0" : faint, whiteSpace: "pre-wrap" }}>{f.improve || "No answer"}</div>
            </Answer>
            <Answer title="WHAT DIDN'T WORK">
                <div style={{ fontSize: 13, lineHeight: 1.7, color: f.broken ? "#fca5a5" : faint, whiteSpace: "pre-wrap" }}>{f.broken || "No answer"}</div>
            </Answer>
        </div>
    );
}

export default function AdminFeedback() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(null);           // email of the expanded user
    const [query, setQuery] = useState("");
    const [minRating, setMinRating] = useState(0);    // 0 = all; otherwise that exact rating

    const fetchReport = useCallback(() =>
        API.get("/admin/feedback")
            .then(r => setData(r.data))
            .catch(() => toast.error("Couldn't load feedback"))
            .finally(() => setLoading(false)), []);
    useEffect(() => { fetchReport(); }, [fetchReport]);     // loading starts true
    const load = () => { setLoading(true); fetchReport(); };

    const q = query.trim().toLowerCase();
    const users = (data?.users || []).filter(u =>
        (!q || u.email.toLowerCase().includes(q) || (u.name || "").toLowerCase().includes(q)) &&
        (!minRating || u.feedback.some(f => f.rating === minRating)));
    const maxCount = Math.max(1, ...Object.values(data?.ratingCounts || {}));

    return (
        <div className="fade-in">
            {/* Totals */}
            <div className="grid4" style={{ marginBottom: 20 }}>
                {[
                    { label: "Responses", val: data?.total ?? 0, color: "#a78bfa" },
                    { label: "Users", val: data?.userCount ?? 0, color: "#22d3ee" },
                    { label: "Average rating", val: data?.averageRating ? `${data.averageRating} / 5` : "—", color: "#fbbf24" },
                    { label: "Top feature", val: data?.topFeatures?.[0]?.name || "—", color: "#4ade80", small: true },
                ].map(c => (
                    <div key={c.label} className="stat-card">
                        <div style={{ fontSize: 10, fontWeight: 700, color: faint, letterSpacing: "0.08em", marginBottom: 10 }}>{c.label.toUpperCase()}</div>
                        <div style={{ fontSize: c.small ? 17 : 28, fontWeight: 800, color: c.color }}>{loading ? "—" : c.val}</div>
                    </div>
                ))}
            </div>

            {data && data.total > 0 && (
                <div className="grid2" style={{ marginBottom: 20 }}>
                    <div className="card" style={{ padding: 18 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: faint, letterSpacing: "0.08em", marginBottom: 12 }}>RATINGS</div>
                        {[5, 4, 3, 2, 1].map(n => {
                            const c = data.ratingCounts?.[n] || 0;
                            return (
                                <div key={n} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                                    <span style={{ width: 24, fontSize: 12, color: muted }}>{n}★</span>
                                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                                        <div style={{ width: `${(c / maxCount) * 100}%`, height: "100%", background: RATING_COLOR[n] }} />
                                    </div>
                                    <span style={{ width: 24, textAlign: "right", fontSize: 12, color: muted }}>{c}</span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="card" style={{ padding: 18 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: faint, letterSpacing: "0.08em", marginBottom: 12 }}>MOST USEFUL FEATURES</div>
                        {data.topFeatures.length === 0 ? (
                            <div style={{ fontSize: 12, color: faint }}>Nobody has picked a feature yet.</div>
                        ) : (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                {data.topFeatures.map(f => (
                                    <span key={f.name} className="badge b-admin" style={{ fontSize: 11 }}>{f.name} · {f.count}</span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Filters */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 320 }}>
                    <Search size={13} aria-hidden style={{ position: "absolute", left: 11, top: 11, color: faint }} />
                    <input aria-label="Search users" placeholder="Search by name or email" value={query} onChange={e => setQuery(e.target.value)}
                           style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px 8px 30px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "#e2e8f0", fontSize: 12, fontFamily: "inherit" }} />
                </div>
                {[0, 5, 4, 3, 2, 1].map(n => (
                    <button key={n} className="ab" onClick={() => setMinRating(n)}
                            style={{ background: minRating === n ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.04)",
                                     color: minRating === n ? "#a78bfa" : muted,
                                     border: `1px solid ${minRating === n ? "rgba(167,139,250,0.3)" : "rgba(255,255,255,0.08)"}`, padding: "8px 12px" }}>
                        {n ? `${n}★` : "All"}
                    </button>
                ))}
                <button className="ab ab-gray" onClick={load} style={{ padding: "8px 13px", marginLeft: "auto" }}>
                    <RefreshCw size={12} className={loading ? "spin" : ""} /> Refresh
                </button>
            </div>

            {/* Users */}
            {loading && !data ? (
                <div style={{ textAlign: "center", padding: 60, color: faint }}>Loading…</div>
            ) : users.length === 0 ? (
                <div className="card" style={{ padding: 40, textAlign: "center", color: faint }}>
                    <MessageSquareHeart size={28} style={{ opacity: 0.25, marginBottom: 10 }} />
                    <div>{data?.total ? "No feedback matches these filters." : "No feedback yet. It appears here when users send it from the About App page."}</div>
                </div>
            ) : (
                <div style={{ display: "grid", gap: 10 }}>
                    {users.map(u => {
                        const isOpen = open === u.email;
                        const entries = minRating ? u.feedback.filter(f => f.rating === minRating) : u.feedback;
                        return (
                            <div key={u.email} className="card" style={{ overflow: "hidden" }}>
                                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : u.email)}
                                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit", flexWrap: "wrap" }}>
                                    {isOpen ? <ChevronDown size={15} color={muted} aria-hidden /> : <ChevronRight size={15} color={muted} aria-hidden />}
                                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(167,139,250,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#a78bfa", flexShrink: 0 }}>
                                        {(u.name || u.email).charAt(0).toUpperCase()}
                                    </div>
                                    <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{u.name || "—"}</div>
                                        <div style={{ fontSize: 11, color: muted, overflow: "hidden", textOverflow: "ellipsis" }}>{u.email}</div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                                        <Stars value={u.latestRating} />
                                        <span className="badge b-cyan">{u.count} response{u.count > 1 ? "s" : ""}</span>
                                        <span style={{ fontSize: 11, color: faint, minWidth: 130, textAlign: "right" }}>{fmt(u.lastSubmittedAt)}</span>
                                    </div>
                                </button>
                                {isOpen && (
                                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "16px 18px", display: "grid", gap: 12 }}>
                                        {entries.map(f => <Entry key={f.id} f={f} />)}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
