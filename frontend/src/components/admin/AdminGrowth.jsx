import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import API from "../../services/api";

// Who comes to FinTwin and how far they get: landing-page visitors, how the
// demo is used, and the funnel from visitor to user. Visitors are browsers
// (an anonymous id each keeps), not people; the funnel is counts for the
// period, not individuals followed through it.

const ink = "#e2e8f0";
const faint = "rgba(148,163,184,0.45)";
const muted = "rgba(148,163,184,0.6)";
// Every chart and bar here is a single series, so one neutral ink: no hue
// that could be mistaken for a category, and readable in both themes
const BAR = "#64748b";

const RANGES = [7, 30, 90];

const exact = (n) => (n ?? 0).toLocaleString("en-IN");
const day = (d) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");

// Every day in the period, with zeros where nothing happened, so a quiet day
// shows as a gap rather than disappearing from the chart
function fillDays(rows, from, to, key) {
    const byDate = Object.fromEntries((rows || []).map(r => [r.date, Number(r[key]) || 0]));
    const out = [];
    for (let d = new Date(from); d <= new Date(to); d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        out.push({ date: iso, value: byDate[iso] || 0 });
    }
    return out;
}

// What the read-only demo turned away, in words
const BLOCKED = [
    [/\/transactions\/(expense|income|manual|batch)/, "Add a transaction"],
    [/\/transactions\/(upload|statement)/, "Upload a statement"],
    [/\/transactions\/upload-screenshot/, "Upload a receipt"],
    [/\/transactions\/(\d+\/category|recategorize)/, "Recategorise a transaction"],
    [/\/chat\/history\/\d+\/rating/, "Rate a copilot answer"],
    [/\/budgets/, "Set or change a budget"],
    [/\/goals/, "Set or change a goal"],
    [/\/(assets|liabilities)/, "Edit net worth"],
    [/\/(portfolio|watchlist)/, "Edit investments"],
    [/\/insurance/, "Edit insurance"],
    [/\/profile/, "Edit their profile"],
    [/\/(bank|crypto)/, "Connect a bank or wallet"],
    [/\/anomalies/, "Review an unusual transaction"],
    [/\/(onboarding|feedback|tickets)/, "Onboarding or feedback"],
];
const blockedLabel = (detail) => BLOCKED.find(([re]) => re.test(detail))?.[1] || detail;

function mergeBlocked(rows) {
    const totals = {};
    (rows || []).forEach(r => { const l = blockedLabel(r.detail); totals[l] = (totals[l] || 0) + Number(r.count); });
    return Object.entries(totals).map(([detail, count]) => ({ detail, count })).sort((a, b) => b.count - a.count);
}

const Label = ({ children }) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: faint, letterSpacing: "0.08em", marginBottom: 12 }}>{children}</div>
);

const DayTip = ({ active, payload, label, unit }) => {
    if (!active || !payload?.length) return null;
    const v = payload[0].payload.value;
    return (
        <div style={{ background: "#0e1018", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: ink }}>
            <div style={{ color: muted, marginBottom: 4 }}>{day(label)}</div>
            <div style={{ fontWeight: 700 }}>{exact(v)} {v === 1 ? unit[0] : unit[1]}</div>
        </div>
    );
};

function DailyChart({ title, data, unit }) {
    return (
        <div className="card" style={{ padding: 18 }}>
            <Label>{title}</Label>
            <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={day} tick={{ fontSize: 10, fill: faint }} axisLine={false} tickLine={false} minTickGap={16} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: faint }} axisLine={false} tickLine={false} />
                    <Tooltip content={<DayTip unit={unit} />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
                    <Bar dataKey="value" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

// A ranked list: label, count, and a thin bar against the largest
function RankedList({ title, rows, labelOf = r => r.detail, countOf = r => Number(r.count), empty }) {
    const max = Math.max(1, ...(rows || []).map(countOf));
    return (
        <div className="card" style={{ padding: 18 }}>
            <Label>{title}</Label>
            {!rows?.length ? (
                <div style={{ fontSize: 12, color: faint, padding: "8px 0" }}>{empty}</div>
            ) : rows.map(r => (
                <div key={labelOf(r)} style={{ padding: "6px 0" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 12, color: ink, marginBottom: 5 }}>
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={labelOf(r)}>{labelOf(r)}</span>
                        <span style={{ fontWeight: 700 }}>{exact(countOf(r))}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.05)" }}>
                        <div style={{ height: 4, borderRadius: 2, width: `${(countOf(r) / max) * 100}%`, background: BAR }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

function Funnel({ f }) {
    const steps = [
        { label: "Visited the landing page", value: f.visitors },
        { label: "Tried the demo", value: f.triedDemo },
        { label: "Signed up", value: f.signedUp },
        { label: "Added their data", value: f.addedData },
    ];
    const max = Math.max(1, ...steps.map(s => s.value));
    return (
        <div className="card" style={{ padding: 18, marginBottom: 16 }}>
            <Label>FUNNEL</Label>
            {steps.map((s, i) => (
                <div key={s.label} style={{ padding: "7px 0" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 13, color: ink, marginBottom: 6 }}>
                        <span style={{ flex: 1 }}>{s.label}</span>
                        <span style={{ fontWeight: 800, fontSize: 15 }}>{exact(s.value)}</span>
                        <span style={{ color: muted, fontSize: 11, width: 120, textAlign: "right" }}>
                            {i === 0 ? "" : `${pct(s.value, steps[i - 1].value)} of the step before`}
                        </span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)" }}>
                        <div style={{ height: 8, borderRadius: 4, width: `${(s.value / max) * 100}%`, background: BAR }} />
                    </div>
                </div>
            ))}
            <div style={{ fontSize: 11, color: faint, marginTop: 10, lineHeight: 1.5 }}>
                Counts for the period, not the same people followed through: a visitor isn't linked to the account they create.
                Visitors are browsers, so one person on a phone and a laptop counts twice. Ad blockers hide some visits.
            </div>
        </div>
    );
}

export default function AdminGrowth() {
    const [days, setDays] = useState(30);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchGrowth = useCallback(() =>
        API.get("/admin/growth", { params: { days } })
            .then(r => setData(r.data))
            .catch(() => toast.error("Couldn't load growth figures"))
            .finally(() => setLoading(false)), [days]);
    useEffect(() => { fetchGrowth(); }, [fetchGrowth]);
    const load = () => { setLoading(true); fetchGrowth(); };
    const pickRange = (d) => { if (d !== days) { setLoading(true); setDays(d); } };

    const v = data?.visitors;
    const demo = data?.demo;

    return (
        <section aria-label="Growth" className="fade-in">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, fontSize: 12, color: muted }}>
                    Landing-page visitors, how the demo is used, and how many become users.
                </div>
                {RANGES.map(d => (
                    <button key={d} className="ab" onClick={() => pickRange(d)} aria-pressed={days === d}
                            style={{ padding: "8px 13px",
                                     background: days === d ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.04)",
                                     color: days === d ? "#a78bfa" : muted,
                                     border: `1px solid ${days === d ? "rgba(167,139,250,0.3)" : "rgba(255,255,255,0.08)"}` }}>
                        {d} days
                    </button>
                ))}
                <button className="ab ab-gray" onClick={load} style={{ padding: "8px 13px" }}>
                    <RefreshCw size={12} className={loading ? "spin" : ""} /> Refresh
                </button>
            </div>

            <div className="grid4" style={{ marginBottom: 16 }}>
                {[
                    { label: "Visitors", val: v?.visitors, sub: v ? `${exact(v.visits)} visits · ${exact(v.returning)} came back` : "" },
                    { label: "Demo sessions", val: demo?.sessions, sub: demo ? `${exact(demo.visitors)} visitors` : "" },
                    { label: "Avg. time in demo", val: demo ? `${demo.avgMinutes} min` : null, sub: "" },
                    { label: "Demo questions", val: demo?.questions, sub: "asked the copilot" },
                    { label: "Sign-up clicks", val: demo?.signupClicks, sub: "from inside the demo" },
                ].map(c => (
                    <div key={c.label} className="stat-card">
                        <div style={{ fontSize: 10, fontWeight: 700, color: faint, letterSpacing: "0.08em", marginBottom: 10 }}>{c.label.toUpperCase()}</div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: ink }}>
                            {loading ? "—" : (typeof c.val === "number" ? exact(c.val) : (c.val ?? "—"))}
                        </div>
                        {!loading && c.sub && <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>{c.sub}</div>}
                    </div>
                ))}
            </div>

            {data && (
                <>
                    <Funnel f={data.funnel} />

                    <div className="grid2" style={{ marginBottom: 16 }}>
                        <DailyChart title="VISITORS PER DAY" unit={["visitor", "visitors"]}
                                    data={fillDays(v.daily, data.from, data.to, "visitors")} />
                        <DailyChart title="DEMO SESSIONS PER DAY" unit={["session", "sessions"]}
                                    data={fillDays(demo.daily, data.from, data.to, "sessions")} />
                    </div>

                    <div className="grid2" style={{ marginBottom: 16 }}>
                        <RankedList title="WHERE VISITORS CAME FROM" rows={v.sources}
                                    labelOf={r => r.source === "direct" ? "Direct or unknown" : r.source}
                                    countOf={r => Number(r.visitors)} empty="No visitors yet." />
                        <RankedList title="PHONE OR COMPUTER" rows={v.devices}
                                    labelOf={r => r.device === "mobile" ? "Phone" : "Computer"}
                                    countOf={r => Number(r.visitors)} empty="No visitors yet." />
                    </div>

                    <div className="grid2" style={{ marginBottom: 16 }}>
                        <RankedList title="WHAT DEMO VISITORS OPENED" rows={demo.pages}
                                    empty="No demo visits yet." />
                        <RankedList title="WHAT THEY TRIED TO CHANGE (THE DEMO IS READ-ONLY)" rows={mergeBlocked(demo.blocked)}
                                    empty="Nothing yet. These show what people wanted to do with their own data." />
                    </div>

                    <div className="card" style={{ overflow: "hidden" }}>
                        <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 13, fontWeight: 700, color: ink }}>
                            Questions demo visitors asked the copilot
                        </div>
                        {!demo.recentQuestions?.length ? (
                            <div style={{ padding: 24, fontSize: 12, color: faint }}>No questions yet.</div>
                        ) : (
                            <div style={{ overflowX: "auto" }}>
                                <table className="tbl">
                                    <thead><tr><th>MOST RECENT</th><th>WHEN</th></tr></thead>
                                    <tbody>
                                        {demo.recentQuestions.map((q, i) => (
                                            <tr key={i}>
                                                <td style={{ color: ink }}>{q.detail}</td>
                                                <td style={{ fontSize: 11, color: faint, whiteSpace: "nowrap" }}>
                                                    {new Date(q.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </section>
    );
}
