import { cx } from "./cx";

const FILL = { accent: "bg-accent", good: "bg-good", bad: "bg-bad", warn: "bg-warn", ink: "bg-ink" };

/** A thin bar. value 0–100 (capped); tone colours the fill. */
export default function Progress({ value = 0, tone = "accent", className, label }) {
    const v = Math.max(0, Math.min(100, Number(value) || 0));
    return (
        <div
            role="progressbar"
            aria-valuenow={Math.round(v)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={label}
            className={cx("h-1.5 w-full rounded-full bg-surface-sunken overflow-hidden", className)}
        >
            <div className={cx("h-full rounded-full transition-[width] duration-500", FILL[tone] || FILL.accent)} style={{ width: `${v}%` }} />
        </div>
    );
}
