import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import API from "../services/api";
import { SectionHeader, Button, xAxis, yAxis, grid, ChartTooltip, cx } from "./ui";
import { rupees } from "../utils/money";
import { RATES, HORIZONS, series, twinExtra } from "../utils/twin";

/*
 * Future Twin: you today, and a twin who also invests what you didn't spend:
 * the money Spend Guard kept by pausing, and round-ups of every payment to
 * the next ₹10. Nothing moves on its own; the page shows what the habit
 * would grow into and how to make it real (a bigger SIP). Returns are
 * assumed, picked by the user, and labelled as such.
 */

const PREFS = "fintwin.twin.prefs";
const loadPrefs = () => {
    try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch { return {}; }
};
const savePrefs = (p) => {
    try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch { /* private window: keep in memory only */ }
};

const gotoSection = (name) => {
    try { localStorage.setItem("activeSection", name); } catch { /* ignore */ }
    window.dispatchEvent(new Event("dashboardNav"));
};

function Chip({ on, onClick, children }) {
    return (
        <button type="button" onClick={onClick} aria-pressed={on}
                className={cx("h-8 px-3 rounded-full text-small font-medium num", on ? "bg-accent-soft text-accent" : "bg-surface-sunken text-ink-3")}>
            {children}
        </button>
    );
}

function Toggle({ label, detail, on, onChange }) {
    return (
        <label className="flex items-start justify-between gap-3 px-4 py-3.5 cursor-pointer">
            <span className="min-w-0">
                <span className="block text-body text-ink">{label}</span>
                <span className="block text-small text-ink-3">{detail}</span>
            </span>
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={on} onChange={(e) => onChange(e.target.checked)} />
        </label>
    );
}

export default function FutureTwin({ onOpenSips }) {
    const [inputs, setInputs] = useState(null);
    const [failed, setFailed] = useState(false);
    const [prefs, setPrefs] = useState(() => ({ rate: 10, years: 10, roundUps: true, pauses: true, extra: 0, ...loadPrefs() }));

    useEffect(() => {
        API.get("/twin").then((r) => setInputs(r.data)).catch(() => setFailed(true));
    }, []);
    const set = (change) => setPrefs((p) => { const next = { ...p, ...change }; savePrefs(next); return next; });

    const points = useMemo(() => (inputs ? series(inputs, prefs, prefs.rate, prefs.years) : []), [inputs, prefs]);

    if (failed) return <p className="max-w-2xl px-1 text-body text-ink-2">Couldn't load your twin. Try again in a moment.</p>;
    if (!inputs) {
        return <div className="max-w-2xl rounded-card bg-surface border border-line px-6 py-10 text-center text-small text-ink-3" role="status">Meeting your twin…</div>;
    }

    const extra = twinExtra(inputs, prefs);
    const end = points[points.length - 1];
    const gap = end.twin - end.you;
    const ru = inputs.roundUps || {};
    const wishes = inputs.wishlistReady || [];

    return (
        <div className="max-w-2xl space-y-8">
            <section aria-label="Your twin" className="px-1">
                <p className="text-small text-ink-3">In {prefs.years} years, your twin has</p>
                <p className="text-hero text-ink num mt-1">{gap > 0 ? `${rupees(gap)} more` : rupees(end.twin)}</p>
                <p className="mt-2 text-body text-ink-2">
                    {extra > 0
                        ? <>By also investing {rupees(extra)} a month you didn't spend: {rupees(end.twin)} against your {rupees(end.you)}.</>
                        : <>Your twin invests what you don't spend. Switch on a habit below, or pause a payment in Spend Guard, and it pulls ahead.</>}
                </p>
            </section>

            <div className="rounded-card bg-surface border border-line p-4">
                <div className="h-48 -ml-2">
                    <ResponsiveContainer initialDimension={{ width: 320, height: 192 }} width="100%" height="100%">
                        <AreaChart data={points}>
                            <CartesianGrid {...grid} />
                            <XAxis {...xAxis} dataKey="year" tickFormatter={(y) => (y === 0 ? "Now" : `${y}y`)} />
                            <YAxis {...yAxis} />
                            <Tooltip content={<ChartTooltip />} labelFormatter={(y) => (y === 0 ? "Now" : `In ${y} years`)} />
                            <Area type="monotone" dataKey="twin" name="Your twin" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.12} strokeWidth={2} />
                            <Line type="monotone" dataKey="you" name="You" stroke="var(--text-dim)" dot={false} strokeWidth={1.5} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                    {HORIZONS.map((y) => <Chip key={y} on={prefs.years === y} onClick={() => set({ years: y })}>{y} years</Chip>)}
                    <span className="w-px h-5 bg-line mx-1" aria-hidden />
                    {RATES.map((r) => <Chip key={r} on={prefs.rate === r} onClick={() => set({ rate: r })}>{r}%</Chip>)}
                </div>
                <p className="mt-2 text-caption text-ink-3">
                    {prefs.rate}% a year is an assumption you chose, not a promise: markets go down as well as up.
                    Both of you start from today's portfolio of {rupees(inputs.portfolioValue)} and your SIPs of {rupees(inputs.sipMonthly)} a month.
                </p>
            </div>

            <section aria-label="What your twin invests">
                <SectionHeader title="What your twin also invests" />
                <div className="rounded-card bg-surface border border-line divide-y divide-line">
                    <Toggle label={`Round-ups: ${rupees(ru.amount || 0)} a month`}
                            detail={ru.payments ? `Every payment last month rounded up to the next ₹10 (${ru.payments} payments).` : "No payments last month to round up."}
                            on={prefs.roundUps} onChange={(v) => set({ roundUps: v })} />
                    <Toggle label={`Kept by pausing: ${rupees(inputs.pausedThisMonth || 0)} this month`}
                            detail={inputs.pausedTotal ? `${rupees(inputs.pausedTotal)} so far. Skipped payments and dropped wishlist items in Spend Guard.` : "Pause a payment in Spend Guard and what you don't spend counts here."}
                            on={prefs.pauses} onChange={(v) => set({ pauses: v })} />
                    <label className="flex items-center justify-between gap-3 px-4 py-3.5">
                        <span className="text-body text-ink">Something extra each month</span>
                        <input type="number" min="0" step="500" inputMode="numeric" aria-label="Extra each month"
                               value={prefs.extra || ""} placeholder="₹0" onChange={(e) => set({ extra: Math.max(0, Number(e.target.value) || 0) })}
                               className="w-28 h-9 rounded-control bg-surface-sunken px-3 text-right text-small text-ink num" />
                    </label>
                </div>
            </section>

            {wishes.length > 0 && (
                <section aria-label="Still want these">
                    <SectionHeader title="Still want these?" />
                    <ul className="rounded-card bg-surface border border-line divide-y divide-line">
                        {wishes.map((w) => (
                            <li key={`${w.name}-${w.readySince}`} className="flex items-center justify-between gap-3 px-4 py-3.5">
                                <span className="min-w-0 text-body text-ink truncate">{w.name}</span>
                                <span className="shrink-0 text-body font-semibold text-ink num">{rupees(w.amount)}</span>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-2 px-1 text-small text-ink-3">
                        Their two-day wait is over. Drop one you don't want in Spend Guard and your twin invests it.
                    </p>
                    <Button size="sm" variant="secondary" className="mt-3" onClick={() => gotoSection("Spend Guard")}>Open the wishlist</Button>
                </section>
            )}

            {extra > 0 && (
                <section aria-label="Make it real" className="rounded-card bg-accent-soft p-4">
                    <p className="text-body font-medium text-ink">Make your twin real</p>
                    <p className="text-small text-ink-2 mt-1">
                        FinTwin doesn't move money. Raise an SIP by about {rupees(Math.round(extra / 100) * 100)} a month, or start one, and you become your twin.
                    </p>
                    <Button size="sm" className="mt-3" onClick={onOpenSips}>Go to SIPs</Button>
                </section>
            )}
        </div>
    );
}
