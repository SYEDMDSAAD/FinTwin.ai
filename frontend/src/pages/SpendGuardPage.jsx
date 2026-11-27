import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, Info, ScanLine, ShieldCheck, Wallet } from "lucide-react";
import { guard, guardError } from "../services/guardApi";
import { GUARD_CSS } from "../components/guard/guardCss";
import { aiStatus, inr } from "../components/guard/format";
import ScanPanel from "../components/guard/ScanPanel";
import WalletPanel from "../components/guard/WalletPanel";

/** Invest → Future Twin, where money kept by pausing is shown invested. */
const openTwin = () => {
    try {
        localStorage.setItem("activeSection", "Future Twin");
    } catch { /* storage blocked: navigation still works */ }
    window.dispatchEvent(new Event("dashboardNav"));
};
import PaydayPanel from "../components/guard/PaydayPanel";

const TABS = [
    { key: "scan", label: "Scan & pay", Icon: ScanLine },
    { key: "wallet", label: "Wallet", Icon: Wallet },
    { key: "payday", label: "Payday", Icon: CalendarCheck },
];

/* Spend Guard (prototype): AI agents that pause before careless spends.
   FinTwin never holds or moves money. Google Pay pays, and the
   balances on these screens are pretend, for the demo. */
export default function SpendGuardPage({ onFinTwinChanged }) {
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
    const wide = useWideScreen();

    return (
        <div className="sg">
            <style>{GUARD_CSS}</style>
            <div className="sg-head">
                <div>
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
                            : "The balances here are pretend, for the demo. Google Pay still moves the money, and you approve every payment there."}
                    </p>
                    <div className="sg-layout">
                    <div className="sg-main">
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
                            wallet={wallet}
                            onWallet={onWallet}
                            onFinTwinChanged={onFinTwinChanged}
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
                        {tab === "payday" && (
                            <PaydayPanel wallet={wallet} onWallet={onWallet} onFinTwinChanged={onFinTwinChanged} />
                        )}
                    </div>
                    </div>
                    {wide && <WeekAside wallet={wallet} />}
                    </div>
                </>
            )}
        </div>
    );
}

const WIDE = "(min-width: 1100px)";

/** True on screens wide enough for the side panel. It isn't rendered at all on
    phones, so the page never carries the same figures twice. */
function useWideScreen() {
    const [wide, setWide] = useState(() => !!window.matchMedia?.(WIDE).matches);
    useEffect(() => {
        const mq = window.matchMedia?.(WIDE);
        if (!mq) return undefined;
        const onChange = () => setWide(mq.matches);
        mq.addEventListener?.("change", onChange);
        return () => mq.removeEventListener?.("change", onChange);
    }, []);
    return wide;
}

/** Wide screens only: this week's money beside the tabs, so it stays in view (and
    updates) while you scan and pay, plus how Spend Guard decides. Phones skip it;
    the Wallet tab has the same figures. */
function WeekAside({ wallet }) {
    return (
        <aside className="sg-aside" aria-label="This week">
            <div className="sg-card">
                <div className="sg-hero-label">Left to spend this week</div>
                <div className="sg-hero">{inr(wallet.balances.spending)}</div>
                <p className="sg-note" style={{ margin: "4px 0 0" }}>
                    Weekly allowance {inr(wallet.weekly)} · next one in {wallet.daysToAllowance} day{wallet.daysToAllowance === 1 ? "" : "s"}
                </p>
                <div className="sg-tiles sg-tiles-2">
                    <div className="sg-tile">
                        <div className="sg-tile-label">Buffer, free for top-ups</div>
                        <div className="sg-tile-value">{inr(wallet.buffer)}</div>
                    </div>
                    <div className="sg-tile">
                        <div className="sg-tile-label">Saved by pausing</div>
                        <div className="sg-tile-value">{inr(wallet.savedByPausing)}</div>
                    </div>
                </div>
                {wallet.savedByPausing > 0 && (
                    <button type="button" className="sg-sub" style={{ marginTop: 10, background: "none", border: 0, padding: 0, cursor: "pointer", textDecoration: "underline" }}
                            onClick={() => openTwin()}>
                        See what it grows into: your Future Twin invests it
                    </button>
                )}
            </div>
            <div className="sg-card">
                <h2 className="sg-h2">How Spend Guard decides</h2>
                <ul className="sg-rules">
                    <li>Essentials and small payments go straight through.</li>
                    <li>A pause only when it matters, explained with your own numbers. Betting always pauses.</li>
                    <li>Money for bills is never touched.</li>
                    <li>You always decide. Google Pay pays.</li>
                </ul>
            </div>
        </aside>
    );
}
