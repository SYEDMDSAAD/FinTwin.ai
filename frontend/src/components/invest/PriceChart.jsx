import { useEffect, useState } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { ChartTooltip } from "../ui/charts";
import { xAxis, yAxis } from "../ui/chartTheme";
import { cx } from "../ui";
import { percent } from "../../utils/money";

/*
 * A price or NAV chart with range pills, like Groww's fund and stock pages.
 * `load(range)` resolves to { points: [{ label, value }], change }. Each range
 * is fetched once and kept, so flipping back is instant.
 */
export default function PriceChart({ load, ranges, initial = "1Y", format, label = "Price", onData }) {
    const [range, setRange] = useState(initial);
    const [byRange, setByRange] = useState({});
    const shown = byRange[range];

    useEffect(() => {
        if (byRange[range]) return;
        let alive = true;
        load(range)
            .then((d) => { if (alive) { setByRange((m) => ({ ...m, [range]: d })); onData?.(d); } })
            .catch(() => { if (alive) setByRange((m) => ({ ...m, [range]: { points: [], failed: true } })); });
        return () => { alive = false; };
    }, [range, byRange, load, onData]);

    const pts = shown?.points || [];
    const up = (shown?.change ?? 0) >= 0;
    const stroke = up ? "var(--good)" : "var(--bad)";
    return (
        <section aria-label={`${label} chart`}>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-2">
                <span className={cx("text-small font-semibold num whitespace-nowrap", shown?.change == null ? "text-ink-3" : up ? "text-good" : "text-bad")}>
                    {shown?.change != null ? `${percent(shown.change, { plus: true })} in ${range === "ALL" ? "all time" : range}` : " "}
                </span>
                <div role="group" aria-label="Chart range" className="flex gap-0.5">
                    {ranges.map((r) => (
                        <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}
                                className={cx("h-7 px-2.5 rounded-full text-caption font-semibold transition-colors",
                                    range === r ? "bg-surface-sunken text-ink" : "text-ink-3 hover:text-ink")}>
                            {r}
                        </button>
                    ))}
                </div>
            </div>
            <div className="h-48">
                {!shown ? (
                    <div className="h-full rounded-control bg-surface-sunken animate-pulse" />
                ) : pts.length < 2 ? (
                    <p className="h-full flex items-center justify-center text-small text-ink-3">
                        {shown.failed ? "The chart is unavailable right now." : "Not enough history for this range."}
                    </p>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={pts} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id={`pc-${up ? "up" : "dn"}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={stroke} stopOpacity={0.18} />
                                    <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis {...xAxis} dataKey="label" minTickGap={40} />
                            <YAxis {...yAxis} domain={["auto", "auto"]} width={52} tickFormatter={(v) => format(v, true)} />
                            <Tooltip content={<ChartTooltip format={(v) => format(v)} />} />
                            <Area type="monotone" dataKey="value" name={label} stroke={stroke} strokeWidth={2}
                                  fill={`url(#pc-${up ? "up" : "dn"})`} isAnimationActive={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </section>
    );
}
