import { useCallback, useEffect, useState } from "react";
import { Mail, Copy, Check, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import API from "../services/api";

// Setting up bank alert forwarding: the user's private address, the Gmail
// steps, Gmail's confirmation code once it lands, and what recent alerts
// turned into. Alerts keep the Today view current within minutes; statements
// fill in whatever alerts miss.

// Gmail's from: matches any address containing the term, so domains are enough.
// .bank.in covers every bank on RBI's new bank-only domain.
export const GMAIL_FILTER =
    "from:(hdfcbank.net OR hdfcbank.com OR icicibank.com OR sbi.co.in OR sbicard.com OR axisbank.com OR kotak.com OR bank.in)";

export const STATUS_LABEL = {
    IMPORTED:     { text: "Added",               color: "var(--good)" },
    DUPLICATE:    { text: "Already had it",      color: "var(--text-secondary)" },
    UNMATCHED:    { text: "Couldn't read",       color: "var(--warn)" },
    REJECTED:     { text: "Not verified",        color: "var(--bad)" },
    CONFIRMATION: { text: "Gmail code received", color: "var(--accent)" },
};

const POLL_MS = 15_000;

export default function EmailAlertsSetup() {
    const [state, setState] = useState(null);
    const [failed, setFailed] = useState(false);
    const [copied, setCopied] = useState("");
    const [confirmRotate, setConfirmRotate] = useState(false);
    const [rotating, setRotating] = useState(false);

    const load = useCallback(() => API.get("/email-alerts")
        .then(res => { setState(res.data); setFailed(false); return res.data; })
        .catch(() => { setFailed(true); return null; }), []);

    useEffect(() => { load(); }, [load]);

    // While Gmail's confirmation code hasn't arrived, look again every so often
    const waitingForCode = state?.enabled && !state.confirmationCode
        && !(state.recent || []).some(e => e.status === "IMPORTED");
    useEffect(() => {
        if (!waitingForCode) return undefined;
        const id = setInterval(load, POLL_MS);
        return () => clearInterval(id);
    }, [waitingForCode, load]);

    const copy = async (text, what) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(what);
            setTimeout(() => setCopied(""), 2000);
        } catch {
            toast.error("Couldn't copy — select the text and copy it instead");
        }
    };

    const rotate = async () => {
        setRotating(true);
        try {
            const res = await API.post("/email-alerts/rotate");
            setState(res.data);
            setConfirmRotate(false);
            toast.success("New address ready — update the forwarding address in Gmail");
        } catch {
            toast.error("Couldn't create a new address. Try again.");
        } finally {
            setRotating(false);
        }
    };

    if (failed || !state) return null;

    if (!state.enabled) {
        return (
            <section aria-label="Bank alert emails" style={CARD}>
                <Header />
                <p style={MUTED}>
                    Coming soon: forward your bank's alert emails and each payment shows up by itself. Until then, add a statement above.
                </p>
            </section>
        );
    }

    const recent = state.recent || [];

    return (
        <section aria-label="Bank alert emails" style={CARD}>
            <Header />
            <p style={{ ...MUTED, marginBottom: 16 }}>
                Forward your bank's transaction alerts here and each payment shows up within minutes — no bank login, no app permissions.
                Only alerts signed by a bank's own mail servers are read.
            </p>

            <div style={{ ...LABEL, marginBottom: 6 }}>Your forwarding address</div>
            <CopyRow value={state.address} copied={copied === "address"} onCopy={() => copy(state.address, "address")} label="Copy address" />

            <ol style={{ margin: "16px 0 0", paddingLeft: 18, display: "grid", gap: 12, fontSize: 13, color: "var(--text-primary)", lineHeight: 1.55 }}>
                <li>
                    In Gmail, open <strong>Settings → See all settings → Forwarding and POP/IMAP</strong>, choose
                    <strong> Add a forwarding address</strong>, and paste the address above.
                </li>
                <li>
                    Gmail emails a confirmation code to that address. It appears here:
                    {state.confirmationCode ? (
                        <div style={{ marginTop: 8 }}>
                            <CopyRow value={state.confirmationCode} copied={copied === "code"}
                                     onCopy={() => copy(state.confirmationCode, "code")} label="Copy code" big />
                            <div style={{ ...MUTED, marginTop: 6 }}>Enter it in Gmail to confirm forwarding.</div>
                        </div>
                    ) : (
                        <div style={{ ...MUTED, marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                            Waiting for Gmail's code…
                            <button type="button" onClick={load} style={LINK_BUTTON}>Check now</button>
                        </div>
                    )}
                </li>
                <li>
                    Don't forward everything: create a filter instead. In Gmail's search bar paste the line below,
                    choose <strong>Create filter</strong>, tick <strong>Forward it to</strong> your FinTwin address, and save.
                    <div style={{ marginTop: 8 }}>
                        <CopyRow value={GMAIL_FILTER} copied={copied === "filter"} onCopy={() => copy(GMAIL_FILTER, "filter")} label="Copy filter" small />
                    </div>
                    <div style={{ ...MUTED, marginTop: 6 }}>Gmail forwards alerts that arrive from now on; import a statement for anything earlier.</div>
                </li>
            </ol>

            {recent.length > 0 && (
                <div style={{ marginTop: 20 }}>
                    <div style={{ ...LABEL, marginBottom: 8 }}>Recent alerts</div>
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
                        {recent.slice(0, 8).map((e, i) => {
                            const s = STATUS_LABEL[e.status] || { text: e.status, color: "var(--text-primary)" };
                            return (
                                <li key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 12 }}>
                                    <span style={{ color: "var(--text-dim)", minWidth: 92 }}>
                                        {new Date(e.receivedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                                    </span>
                                    <span style={{ color: "var(--text-primary)", flex: 1 }}>{e.account || e.bank || "Email"}</span>
                                    <span style={{ color: s.color, fontWeight: 600 }} title={e.detail || ""}>{s.text}</span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--border-card)" }}>
                {confirmRotate ? (
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, fontSize: 12, color: "var(--text-secondary)" }}>
                        The current address stops working immediately, and you'll set up forwarding in Gmail again.
                        <button type="button" onClick={rotate} disabled={rotating} style={{ ...LINK_BUTTON, color: "var(--bad)" }}>
                            {rotating ? "Creating…" : "Yes, new address"}
                        </button>
                        <button type="button" onClick={() => setConfirmRotate(false)} style={LINK_BUTTON}>Cancel</button>
                    </div>
                ) : (
                    <button type="button" onClick={() => setConfirmRotate(true)} style={{ ...LINK_BUTTON, display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <RefreshCw size={12} aria-hidden /> Get a new address (if this one was shared)
                    </button>
                )}
            </div>
        </section>
    );
}

function Header() {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <span style={{ width: 40, height: 40, borderRadius: 99, background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Mail size={18} aria-hidden /></span>
            <h3 style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Bank alert emails</h3>
        </div>
    );
}

function CopyRow({ value, copied, onCopy, label, big, small }) {
    return (
        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            <code style={{
                flex: 1, minWidth: 0, overflowX: "auto", whiteSpace: "nowrap",
                padding: big ? "10px 14px" : "10px 12px", borderRadius: "var(--radius-control)",
                background: "var(--bg-input)", border: "1px solid transparent",
                color: "var(--text-primary)", fontSize: big ? 18 : small ? 11 : 13, letterSpacing: big ? "0.08em" : 0,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}>{value}</code>
            <button type="button" onClick={onCopy} aria-label={label} title={label} style={{
                padding: "0 14px", borderRadius: 999, cursor: "pointer",
                background: copied ? "var(--good-soft)" : "var(--accent-soft)",
                border: "none",
                color: copied ? "var(--good)" : "var(--accent)",
            }}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
        </div>
    );
}

const CARD = { background: "var(--bg-card)", border: "1px solid var(--border-card)", borderRadius: "var(--radius-card)", padding: 20, marginTop: 8 };
const LABEL = { fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" };
const MUTED = { fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55, margin: 0 };
const LINK_BUTTON = { background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--accent)", fontSize: 13, fontWeight: 600, fontFamily: "inherit" };
