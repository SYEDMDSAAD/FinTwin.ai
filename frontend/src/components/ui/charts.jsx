/* The chart tooltip in the app's style. Axis and colour settings: chartTheme.js */
/** Tooltip box in the app's style; use as <Tooltip content={<ChartTooltip />} />. */
export function ChartTooltip({ active, payload, label, format = (v) => `₹${Math.round(v).toLocaleString("en-IN")}` }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-control bg-surface-raised border border-line shadow-raised px-3 py-2">
            {label != null && <p className="text-caption text-ink-3 mb-0.5">{label}</p>}
            {payload.map((p) => (
                <p key={p.dataKey} className="text-small text-ink num flex items-center gap-2">
                    {payload.length > 1 && <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />}
                    {payload.length > 1 && <span className="text-ink-3">{p.name}</span>}
                    <span className="font-semibold">{format(p.value)}</span>
                </p>
            ))}
        </div>
    );
}
