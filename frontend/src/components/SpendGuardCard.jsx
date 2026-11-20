import { useEffect, useState } from "react";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { guard, guardEnabled } from "../services/guardApi";

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

/** Monday of this week, local time: the week Spend Guard's allowance runs on. */
function weekStart(now = new Date()) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
}

/**
 * Spend Guard on the dashboard: this week at a glance and a way in. Shown only
 * to accounts Spend Guard is open to (the backend's /guard/enabled), so
 * nobody sees a card they can't use. A failed read just hides it.
 */
export default function SpendGuardCard({ onOpen }) {
    const [wallet, setWallet] = useState(null);

    useEffect(() => {
        let live = true;
        guardEnabled()
            .then((on) => (on ? guard("wallet") : null))
            .then((w) => { if (live && w) setWallet(w); })
            .catch(() => {});
        return () => { live = false; };
    }, []);

    if (!wallet) return null;
    const since = weekStart();
    const thisWeek = (wallet.recent || []).filter((e) => e.type === "scan" && new Date(e.at) >= since);
    const pauses = thisWeek.filter((e) => e.decision === "pause").length;
    const days = wallet.daysToAllowance;
    const stats = [
        { label: "Spending money left", value: inr(wallet.balances?.spending),
          note: days == null ? "this week" : `${days} day${days === 1 ? "" : "s"} to your next allowance` },
        { label: "Saved by pausing", value: inr(wallet.savedByPausing), note: "payments you skipped or put off" },
        { label: "Payments checked", value: String(thisWeek.length), note: `${pauses} paused this week` },
    ];

    return (
        <section className="sgc" aria-labelledby="sg-dash-title">
            <style>{CSS}</style>
            <div className="sgc-top">
                <div className="sgc-head">
                    <div className="sgc-icon"><ShieldCheck size={20} aria-hidden /></div>
                    <div style={{ minWidth: 0 }}>
                        <h2 id="sg-dash-title" className="sgc-title">Spend Guard <span className="sgc-new">New feature</span></h2>
                        <p className="sgc-sub">
                            Checks a payment before you pay, against your budget, your week and your goals,
                            and pauses only when it matters.
                        </p>
                    </div>
                </div>
                <button type="button" className="sgc-btn" onClick={onOpen}>
                    {wallet.recent?.length ? "Open Spend Guard" : "Try Spend Guard"} <ArrowRight size={16} aria-hidden />
                </button>
            </div>
            <div className="sgc-stats">
                {stats.map((s) => (
                    <div key={s.label} className="sgc-stat">
                        <div className="sgc-label">{s.label}</div>
                        <div className="sgc-value">{s.value}</div>
                        <div className="sgc-note">{s.note}</div>
                    </div>
                ))}
            </div>
        </section>
    );
}

// Dark by default; the light theme (the app's default) swaps the tokens
const CSS = `
  .sgc { --sgc-ink: #f8fafc; --sgc-sub: #cbd5e1; --sgc-muted: #94a3b8; --sgc-accent: #4ade80;
         --sgc-bg: linear-gradient(135deg, rgba(34,197,94,0.10), rgba(34,211,238,0.06));
         --sgc-border: rgba(34,197,94,0.25); --sgc-tile: rgba(255,255,255,0.04); --sgc-tile-border: rgba(255,255,255,0.08);
         position: relative; overflow: hidden; margin-bottom: 24px; background: var(--sgc-bg);
         border: 1px solid var(--sgc-border); border-radius: 22px;
         padding: clamp(16px, 4vw, 24px) clamp(16px, 4vw, 28px); }
  :root[data-theme="light"] .sgc { --sgc-ink: #0f172a; --sgc-sub: #334155; --sgc-muted: #475569; --sgc-accent: #15803d;
         --sgc-bg: linear-gradient(135deg, #f0fdf4, #ecfeff); --sgc-border: #bbf7d0;
         --sgc-tile: #ffffff; --sgc-tile-border: #dcfce7; }
  .sgc-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .sgc-head { display: flex; gap: 12px; align-items: flex-start; min-width: 0; flex: 1 1 280px; }
  .sgc-icon { width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0; display: grid; place-items: center;
              background: rgba(34,197,94,0.15); color: var(--sgc-accent); }
  .sgc-title { margin: 0; font-size: 18px; font-weight: 700; color: var(--sgc-ink); }
  .sgc-new { display: inline-block; margin-left: 8px; font-size: 10px; font-weight: 800; letter-spacing: 0.06em;
             text-transform: uppercase; padding: 3px 8px; border-radius: 999px; background: #15803d; color: #fff; vertical-align: 3px; }
  .sgc-sub { margin: 4px 0 0; font-size: 14px; color: var(--sgc-sub); line-height: 1.5; }
  .sgc-btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 12px; border: none;
             cursor: pointer; font-weight: 600; font-size: 14px; background: #15803d; color: #fff; }
  .sgc-btn:hover { background: #166534; }
  .sgc-btn:focus-visible { outline: 2px solid var(--sgc-accent); outline-offset: 2px; }
  .sgc-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-top: 18px; }
  .sgc-stat { padding: 12px 14px; border-radius: 14px; background: var(--sgc-tile); border: 1px solid var(--sgc-tile-border); }
  .sgc-label { font-size: 12px; color: var(--sgc-muted); }
  .sgc-value { font-size: 22px; font-weight: 800; color: var(--sgc-ink); margin-top: 4px; }
  .sgc-note { font-size: 12px; color: var(--sgc-muted); margin-top: 2px; }
`;
