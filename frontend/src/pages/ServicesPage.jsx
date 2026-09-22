import {
    ArrowLeft,
    BarChart3, Brain, MessageSquare, Zap, Target, ShieldCheck,
    Landmark, TrendingUp, Shield, Upload, FileInput, FileText, Settings, Info,
} from "lucide-react";

const GROUPS = [
    {
        label: "OVERVIEW",
        items: [
            { name: "About App", icon: Info,      desc: "What FinTwin does & beta notes" },
            { name: "Analytics", icon: BarChart3, desc: "Spending trends & breakdowns" },
        ],
    },
    {
        label: "AI SUITE",
        items: [
            { name: "AI Intelligence",   icon: Brain,         desc: "Forecasts, alerts & score" },
            { name: "AI Copilot",        icon: MessageSquare, desc: "Chat with your finances" },
            { name: "AI Spending Coach", icon: Zap,           desc: "Personalized coaching" },
        ],
    },
    {
        label: "FINANCE",
        items: [
            { name: "Goals Planner", icon: Target,     desc: "Track savings goals" },
            { name: "Budgeting",     icon: ShieldCheck, desc: "Budgets & affordability" },
            { name: "Net Worth",     icon: Landmark,    desc: "Assets & liabilities" },
            { name: "Investments",   icon: TrendingUp,  desc: "Portfolio overview" },
            { name: "Insurance",     icon: Shield,      desc: "Policies & renewals" },
        ],
    },
    {
        label: "SYSTEM",
        items: [
            { name: "OCR Uploads",       icon: Upload,     desc: "Scan receipts & bills" },
            { name: "Imports",           icon: FileInput,  desc: "Bulk import statements" },
            { name: "Executive Reports", icon: FileText,   desc: "Weekly summaries" },
            { name: "Settings",          icon: Settings,   desc: "Account & preferences" },
        ],
    },
];

function ServicesPage({ navigateTo }) {
    return (
        <div style={{ paddingBottom: 96 }}>
            <div style={{ marginBottom: 24 }}>
                <button
                    onClick={() => navigateTo("Dashboard")}
                    style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: 36, height: 36, borderRadius: 10, marginBottom: 14,
                        border: "1px solid var(--border-subtle)",
                        background: "var(--bg-input)",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                    }}
                    aria-label="Back to Dashboard"
                >
                    <ArrowLeft size={18} />
                </button>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Services</h1>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                    All your finance tools in one place
                </p>
            </div>

            {GROUPS.map((group) => (
                <div key={group.label} style={{ marginBottom: 28 }}>
                    <p style={{
                        fontSize: 11, fontWeight: 700, letterSpacing: "0.10em",
                        color: "var(--text-label)", marginBottom: 12,
                    }}>
                        {group.label}
                    </p>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        {group.items.map(({ name, icon: Icon, desc }) => (
                            <button
                                key={name}
                                onClick={() => navigateTo(name)}
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "flex-start",
                                    gap: 10,
                                    padding: 16,
                                    borderRadius: 16,
                                    border: "1px solid var(--border-card)",
                                    background: "var(--bg-card)",
                                    textAlign: "left",
                                    cursor: "pointer",
                                    fontFamily: "inherit",
                                    transition: "all 0.15s",
                                }}
                            >
                                <div style={{
                                    width: 36, height: 36, borderRadius: 10,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    background: "rgba(167,139,250,0.12)",
                                }}>
                                    <Icon size={18} color="#a78bfa" />
                                </div>
                                <div>
                                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                                        {name}
                                    </p>
                                    <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                                        {desc}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

export default ServicesPage;
