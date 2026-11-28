import { useEffect, useState } from "react";
import { Radio, FileCheck, AlertTriangle, CreditCard, Landmark } from "lucide-react";
import { SectionHeader, IconChip, cx } from "./ui";
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
    live:   { cls: "text-good", Icon: Radio },
    ok:     { cls: "text-ink-3", Icon: FileCheck },
    behind: { cls: "text-warn", Icon: AlertTriangle },
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
        <section aria-label="Your data" className="mb-8">
            <SectionHeader title="Your accounts" subtitle="How up to date each one is" />
            {accounts.length === 0 ? (
                <p className="px-4 py-4 rounded-card bg-surface border border-line text-small text-ink-3">
                    No accounts yet. Import a statement below, or forward your bank's alert emails, and each
                    account shows here.
                </p>
            ) : (
                <ul className="rounded-card bg-surface border border-line divide-y divide-line">
                    {accounts.map(c => {
                        const d = describeCoverage(c);
                        const t = TONES[d.tone];
                        return (
                            <li key={c.account} className="flex items-center gap-3 px-4 py-3">
                                <IconChip icon={c.card ? CreditCard : Landmark} />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-body text-ink truncate">{c.account}</span>
                                    <span className={cx("inline-flex items-center gap-1 text-small", t.cls)}>
                                        <t.Icon size={12} aria-hidden /> {d.text}
                                    </span>
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
