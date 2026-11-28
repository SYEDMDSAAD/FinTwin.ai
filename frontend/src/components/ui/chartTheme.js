/*
 * One look for every chart: quiet axes, no axis lines, hairline gridlines,
 * the same tooltip, and the theme's colours (CSS variables, so dark mode
 * follows). Spread the props: <XAxis {...xAxis} dataKey="month" />.
 */

/** ₹1.2L, ₹45k, ₹800: short enough for an axis tick. */
export function shortRupees(v) {
    const n = Number(v) || 0;
    const a = Math.abs(n);
    const sign = n < 0 ? "−" : "";
    if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1).replace(/\.0$/, "")}Cr`;
    if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1).replace(/\.0$/, "")}L`;
    if (a >= 1e3) return `${sign}₹${Math.round(a / 1e3)}k`;
    return `${sign}₹${Math.round(a)}`;
}

const tick = { fill: "var(--text-dim)", fontSize: 12 };

export const xAxis = { axisLine: false, tickLine: false, tick, tickMargin: 8, interval: "preserveStartEnd" };
export const yAxis = { axisLine: false, tickLine: false, tick, width: 44, tickFormatter: shortRupees, tickCount: 4 };
export const grid = { stroke: "var(--border-card)", vertical: false };

/** Series colours in order: the accent, then calm, distinct hues. */
export const SERIES = ["var(--accent)", "#0EA5A4", "#F59E0B", "#EC4899", "#3B82F6", "#84CC16", "#94A3B8"];

export const tooltipCursor = { fill: "var(--bg-input)" };
