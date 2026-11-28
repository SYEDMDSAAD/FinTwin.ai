import { cx } from "./cx";

const VALUE_TONE = { good: "text-good", bad: "text-bad", warn: "text-warn" };

/** A labelled number: label above, value, an optional note below. */
export default function Stat({ label, value, note, tone, size = "md", className }) {
    return (
        <div className={cx("min-w-0", className)}>
            <p className="text-small text-ink-3">{label}</p>
            <p className={cx(
                "num truncate",
                size === "hero" ? "text-hero mt-1" : size === "lg" ? "text-display mt-1" : "text-[22px] leading-tight font-[650] tracking-[-0.02em] mt-0.5",
                VALUE_TONE[tone] || "text-ink",
            )}>
                {value}
            </p>
            {note && <p className="text-small text-ink-3 mt-1 truncate">{note}</p>}
        </div>
    );
}
