import { useEffect, useState } from "react";
import { Radio, FileCheck, AlertTriangle, CreditCard, Landmark } from "lucide-react";
import API from "../services/api";

// How complete each account's data is. Without a bank link nothing arrives by
// itself, so a month with no statement looks like a month with no spending —
// this panel is where the app says which it is.

const shortDate = (iso) =>
    iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";

export function describeCoverage(c) {
    if (c.status === "LIVE") {
        return c.lastAlert
            ? { tone: "live", text: `Live · alerts up to ${shortDate(c.lastAlert)}` }
            : { tone: "live", text: "Live · linked bank" };
    }
    if (c.status === "CURRENT") {
        return { tone: "ok", text: `Statements up to ${shortDate(c.statementsUpTo)}` };
    }
    if (c.missingMonths?.length) {
        const months = c.missingMonths;
        const last = months[months.length - 1];
        return {
            tone: "behind",
            text: months.length === 1 ? `${last} statement missing` : `${months.length} months missing, latest ${last}`,
        };
    }
    return { tone: "behind", text: `Nothing since ${shortDate(c.lastTransaction)}` };
}

const TONES = {
    live:   { color: "#4ade80", bg: "rgba(74,222,128,0.08)",  border: "rgba(74,222,128,0.25)",  Icon: Radio },
    ok:     { color: "#a78bfa", bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.25)", Icon: FileCheck },
    behind: { color: "#fbbf24", bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.25)",  Icon: AlertTriangle },
};

export default function DataCoverage({ refreshKey = 0 }) {
    const [accounts, setAccounts] = useState(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        API.get("/data-coverage")
            .then(res => { if (alive) { setAccounts(Array.isArray(res.data) ? res.data : []); setFailed(false); } })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [refreshKey]);

    if (failed) return null;          // the importer below still works; don't block it
    if (accounts === null) return null;

    return (
        <section aria-label="Your data" style={CARD}>
            <div style={LABEL}>YOUR DATA</div>
            {accounts.length === 0 ? (
                <p style={{ fontSize: 13, color: "rgba(148,163,184,0.6)", margin: 0, lineHeight: 1.6 }}>
                    No accounts yet. Import a statement below, or forward your bank's alert emails, and each
                    account will show here with how up to date it is.
                </p>
            ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                    {accounts.map(c => {
                        const d = describeCoverage(c);
                        const t = TONES[d.tone];
                        const KindIcon = c.card ? CreditCard : Landmark;
                        return (
                            <li key={c.account} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                                <KindIcon size={16} color="rgba(148,163,184,0.6)" aria-hidden />
                                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#fff", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {c.account}
                                </span>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: t.color, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>
                                    <t.Icon size={11} aria-hidden /> {d.text}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

const CARD = { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18, padding: 20, marginBottom: 20 };
const LABEL = { fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em", marginBottom: 12 };
