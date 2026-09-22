import {
    Sparkles, FlaskConical, LayoutDashboard, BarChart3, Wallet, Brain, MessageSquare, Zap,
    Target, ShieldCheck, Landmark, TrendingUp, Shield, Upload, FileInput, FileText, Settings,
    Lock, ArrowRight, MessageCircleWarning,
} from "lucide-react";

// The landing section: what FinTwin is, that it's a beta, and a map of every
// section so a new user knows what's behind each sidebar item. Each feature
// card opens its section.

const GROUPS = [
    {
        label: "Overview",
        items: [
            { name: "Dashboard", icon: LayoutDashboard, color: "#a78bfa",
              text: "Your month at a glance: income, expenses, savings rate, financial score, goals, alerts and next month's expense forecast." },
            { name: "Analytics", icon: BarChart3, color: "#60a5fa",
              text: "Where the money goes: category breakdowns, a spending heatmap, recurring charges and trends month on month." },
            { name: "Transactions", icon: Wallet, color: "#34d399",
              text: "Every transaction, categorised automatically. Correct a category once and FinTwin remembers it for that merchant; sort anything left in \"Other\" in one place." },
        ],
    },
    {
        label: "AI suite",
        items: [
            { name: "AI Intelligence", icon: Brain, color: "#c084fc",
              text: "Anomaly detection on unusual charges, spending forecasts by category, and a financial health score with the reasons behind it." },
            { name: "AI Copilot", icon: MessageSquare, color: "#f472b6",
              text: "Ask questions about your own money in plain language — \"what did I spend on food last month?\" — answered from your real data." },
            { name: "AI Spending Coach", icon: Zap, color: "#fbbf24",
              text: "Personal coaching on your habits: where you leak money, what to cut, and how much that frees up." },
        ],
    },
    {
        label: "Finance",
        items: [
            { name: "Goals Planner", icon: Target, color: "#fb7185",
              text: "Set savings goals with a target and a date. Progress comes from what you actually save, with a plan for what's needed each month." },
            { name: "Budgeting", icon: ShieldCheck, color: "#4ade80",
              text: "Monthly budgets per category with live usage, plus an affordability check before a big purchase." },
            { name: "Net Worth", icon: Landmark, color: "#f59e0b",
              text: "Assets minus liabilities, including loans with real EMI and debt-to-income figures." },
            { name: "Investments", icon: TrendingUp, color: "#22d3ee",
              text: "Your portfolio valued at live prices, SIPs, mutual funds, US stocks and IPOs — and Discover, to browse open IPOs, funds and stocks." },
            { name: "Insurance", icon: Shield, color: "#818cf8",
              text: "Keep track of your policies, premiums and renewal dates in one place." },
        ],
    },
    {
        label: "Your data",
        items: [
            { name: "Imports", icon: FileInput, color: "#2dd4bf",
              text: "Bring in bank and UPI statements as CSV, PDF or Excel (password-protected PDFs included), or forward bank alert emails." },
            { name: "OCR Uploads", icon: Upload, color: "#a3e635",
              text: "Upload a screenshot of a payment or statement and the transactions in it are extracted and categorised for you." },
            { name: "Executive Reports", icon: FileText, color: "#e879f9",
              text: "A weekly report: what changed against last period, the risks, and what to do next." },
            { name: "Settings", icon: Settings, color: "#94a3b8",
              text: "Profile, password, two-factor authentication, and deleting your account and data." },
        ],
    },
];

const card = {
    background: "var(--bg-card)",
    border: "1px solid var(--border-card)",
    borderRadius: 18,
};

export default function AboutPage({ navigateTo }) {
    return (
        <div style={{ display: "grid", gap: 28 }}>
            {/* Intro, with the beta welcome at the top right */}
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "stretch" }}>
                <div style={{ ...card, flex: "2 1 420px", padding: "28px 28px 26px", position: "relative", overflow: "hidden" }}>
                    <div aria-hidden style={{ position: "absolute", right: -60, top: -60, width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle, rgba(167,139,250,0.22), transparent 70%)" }} />
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 14 }}>
                        <Sparkles size={12} color="#a78bfa" aria-hidden />
                        <span style={{ color: "#a78bfa" }}>ABOUT THE APP</span>
                    </div>
                    <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.2, fontWeight: 800, color: "var(--text-primary)" }}>
                        FinTwin.ai — a digital twin of your finances
                    </h1>
                    <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.7, color: "var(--text-secondary)", maxWidth: 640 }}>
                        FinTwin brings your money into one place — spending, budgets, goals, net worth and investments —
                        and puts AI to work on it. It sorts your transactions, spots charges that look wrong, forecasts
                        next month, values your portfolio at live prices, and answers questions about your money in
                        plain language. The more of your statements you bring in, the more accurate the picture gets.
                    </p>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
                        <button type="button" onClick={() => navigateTo("Imports")}
                                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#a78bfa,#7c3aed)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                            Import a statement <ArrowRight size={14} aria-hidden />
                        </button>
                        <button type="button" onClick={() => navigateTo("Dashboard")}
                                style={{ padding: "10px 16px", borderRadius: 12, border: "1px solid var(--border-card)", background: "var(--bg-subtle)", color: "var(--text-primary)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                            Go to Dashboard
                        </button>
                    </div>
                </div>

                <aside aria-label="Beta notice" style={{ ...card, flex: "1 1 280px", padding: 22, borderColor: "rgba(245,158,11,0.35)", background: "linear-gradient(160deg, rgba(245,158,11,0.10), var(--bg-card) 60%)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 11, background: "rgba(245,158,11,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <FlaskConical size={18} color="#f59e0b" aria-hidden />
                        </div>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>Welcome to FinTwin.ai</div>
                            <span style={{ display: "inline-block", marginTop: 2, padding: "1px 8px", borderRadius: 6, background: "rgba(245,158,11,0.15)", fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: "#f59e0b" }}>BETA</span>
                        </div>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: "var(--text-secondary)" }}>
                        Thanks for trying FinTwin early. This is a beta build for testing, so expect a few rough edges.
                    </p>
                    <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7, color: "var(--text-secondary)" }}>
                        <li>Features may change, and data may occasionally be reset.</li>
                        <li>The Setu bank connection is a <strong style={{ color: "var(--text-primary)" }}>sandbox demo</strong> with sample transactions — import your statements for real data.</li>
                        <li>AI answers, forecasts and market prices are for information only — <strong style={{ color: "var(--text-primary)" }}>not financial advice</strong>.</li>
                    </ul>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 14, padding: "10px 12px", borderRadius: 12, background: "var(--bg-subtle)", border: "1px solid var(--border-subtle)" }}>
                        <MessageCircleWarning size={14} color="#f59e0b" aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
                        <span style={{ fontSize: 12, lineHeight: 1.55, color: "var(--text-secondary)" }}>
                            Found a bug or something confusing? Note what you did and what you expected, and let the FinTwin team know — it really helps.
                        </span>
                    </div>
                </aside>
            </div>

            {/* How it works */}
            <section aria-labelledby="how-it-works">
                <h2 id="how-it-works" style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>How it works</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                    {[
                        ["1", "Bring in your data", "Import bank or UPI statements, forward alert emails, upload screenshots, or add entries by hand."],
                        ["2", "FinTwin organises it", "Transactions are categorised, transfers between your own accounts are left out, and recurring charges are found."],
                        ["3", "AI finds what matters", "Unusual charges, where money leaks, what next month looks like, and how your score is moving."],
                        ["4", "You plan ahead", "Set budgets and goals, track your investments and net worth, and ask the Copilot anything."],
                    ].map(([n, title, text]) => (
                        <div key={n} style={{ ...card, padding: 18 }}>
                            <div style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(167,139,250,0.14)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, marginBottom: 10 }}>
                                <span style={{ color: "#a78bfa" }}>{n}</span>
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{title}</div>
                            <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>{text}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Every section */}
            {GROUPS.map(g => (
                <section key={g.label} aria-label={g.label}>
                    <h2 style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-label)" }}>{g.label}</h2>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
                        {g.items.map(({ name, icon: Icon, color, text }) => (
                            <button key={name} type="button" onClick={() => navigateTo(name)}
                                    style={{ ...card, padding: 18, textAlign: "left", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 8 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div style={{ width: 34, height: 34, borderRadius: 10, background: `${color}1f`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                        <Icon size={17} color={color} aria-hidden />
                                    </div>
                                    <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{name}</span>
                                    <ArrowRight size={14} aria-hidden style={{ color: "var(--text-dim)" }} />
                                </div>
                                <span style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>{text}</span>
                            </button>
                        ))}
                    </div>
                </section>
            ))}

            {/* Privacy */}
            <div style={{ ...card, padding: 20, display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(74,222,128,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Lock size={16} color="#4ade80" aria-hidden />
                </div>
                <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Your data stays yours</div>
                    <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.65, color: "var(--text-secondary)" }}>
                        Sensitive fields are encrypted at rest (AES-256), sign-in supports two-factor authentication, and
                        FinTwin never asks for your bank login or card details. You can delete your account and all its
                        data at any time from Settings.
                    </p>
                </div>
            </div>
        </div>
    );
}
