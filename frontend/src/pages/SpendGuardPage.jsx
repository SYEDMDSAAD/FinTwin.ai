import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, Info, ScanLine, ShieldCheck, Wallet } from "lucide-react";
import { guard, guardError } from "../services/guardApi";
import { GUARD_CSS } from "../components/guard/guardCss";
import { aiStatus } from "../components/guard/format";
import ScanPanel from "../components/guard/ScanPanel";
import WalletPanel from "../components/guard/WalletPanel";
import PaydayPanel from "../components/guard/PaydayPanel";

const TABS = [
    { key: "scan", label: "Scan & pay", Icon: ScanLine },
    { key: "wallet", label: "Wallet", Icon: Wallet },
    { key: "payday", label: "Payday", Icon: CalendarCheck },
];

/* Spend Guard (prototype): AI agents that pause before careless spends.
   FinTwin never holds or moves money. The user's own UPI app pays, and the
   balances on these screens are pretend, for the demo. */
export default function SpendGuardPage() {
    const [tab, setTab] = useState("scan");
    const [wallet, setWallet] = useState(null);
    const [error, setError] = useState("");
    const [topupPrefill, setTopupPrefill] = useState(null);
    const [buying, setBuying] = useState(null);

    const load = useCallback(async () => {
        setError("");
        try {
            setWallet(await guard("wallet"));
        } catch (e) {
            setError(guardError(e));
        }
    }, []);

    // First load: state changes only once the answer is in, and not after the page has gone
    useEffect(() => {
        let live = true;
        guard("wallet")
            .then((w) => live && setWallet(w))
            .catch((e) => live && setError(guardError(e)));
        return () => {
            live = false;
        };
    }, []);

    const onWallet = useCallback((w) => {
        if (w) setWallet(w);
    }, []);

    // A shortfall handed over from the scanner fills the top-up form once, not every visit
    const openTab = useCallback((key) => {
        if (key !== "wallet") setTopupPrefill(null);
        setTab(key);
    }, []);

    function onTabKey(e) {
        const i = TABS.findIndex((t) => t.key === tab);
        const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        const key = TABS[(next + TABS.length) % TABS.length].key;
        openTab(key);
        document.getElementById(`sg-tab-${key}`)?.focus();
    }

    const status = wallet ? aiStatus(wallet.ai) : null;

    return (
        <div className="sg">
            <style>{GUARD_CSS}</style>
            <div className="sg-head">
                <div>
                    <div className="sg-eyebrow">AI Suite · Prototype</div>
                    <h1 className="sg-h1">Spend Guard</h1>
                    <p className="sg-sub">Splits your salary on payday, and pauses before a payment you might regret.</p>
                </div>
                {status && (
                    <span className={`sg-chip sg-chip-${status.tone}`} title="Who is making the decisions">
                        <ShieldCheck size={13} aria-hidden /> {status.label}
                    </span>
                )}
            </div>

            {error && !wallet && (
                <div className="sg-card">
                    <div className="sg-error" role="alert" style={{ marginBottom: 12 }}>{error}</div>
                    <button type="button" className="sg-btn" onClick={load}>Try again</button>
                </div>
            )}
            {!wallet && !error && <div className="sg-card"><p className="sg-sub">Loading Spend Guard…</p></div>}

            {wallet && (
                <>
                    <p className="sg-note" style={{ display: "flex", gap: 6, alignItems: "flex-start", margin: "0 0 12px" }}>
                        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
                        {wallet.mock
                            ? "Mock mode: made-up data, and no AI. Nothing is paid."
                            : "The balances here are pretend, for the demo. Your own UPI app still moves the money, and you approve every payment there."}
                    </p>
                    {/* The ARIA tabs pattern: one tab stop, arrow keys (and Home/End) move between tabs */}
                    <div className="sg-tabs" role="tablist" aria-label="Spend Guard" onKeyDown={onTabKey}>
                        {TABS.map(({ key, label, Icon }) => (
                            <button key={key} type="button" role="tab" className="sg-tab" id={`sg-tab-${key}`}
                                    aria-selected={tab === key} aria-controls={`sg-panel-${key}`}
                                    tabIndex={tab === key ? 0 : -1} onClick={() => openTab(key)}>
                                <Icon size={15} aria-hidden /> {label}
                            </button>
                        ))}
                    </div>
                    {/* Kept mounted so a scan in progress survives a look at the wallet */}
                    <div role="tabpanel" id="sg-panel-scan" aria-labelledby="sg-tab-scan" hidden={tab !== "scan"}>
                        <ScanPanel
                            onWallet={onWallet}
                            initial={buying}
                            onNeedTopup={(amount) => {
                                setTopupPrefill(amount);
                                setTab("wallet");
                            }}
                        />
                    </div>
                    <div role="tabpanel" id="sg-panel-wallet" aria-labelledby="sg-tab-wallet" hidden={tab !== "wallet"}>
                        {tab === "wallet" && (
                            <WalletPanel
                                wallet={wallet}
                                onWallet={onWallet}
                                topupPrefill={topupPrefill}
                                onBuy={(buy) => {
                                    setBuying({ ...buy });
                                    openTab("scan");
                                }}
                            />
                        )}
                    </div>
                    <div role="tabpanel" id="sg-panel-payday" aria-labelledby="sg-tab-payday" hidden={tab !== "payday"}>
                        {tab === "payday" && <PaydayPanel wallet={wallet} onWallet={onWallet} />}
                    </div>
                </>
            )}
        </div>
    );
}
