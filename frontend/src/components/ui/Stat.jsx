import { cx } from "./cx";

const VALUE_TONE = { good: "text-good", bad: "text-bad", warn: "text-warn" };

/** A labelled number: label above, value, an optional note below. */
export default function Stat({ label, value, note, tone, size = "md", className }) {
    return (
        <div className={cx("min-w-0", className)}>
            <p className="text-caption font-medium text-ink-2">{label}</p>
            <p className={cx(
                "font-bold tracking-tight truncate",
                size === "lg" ? "text-display mt-1" : "text-[20px] leading-tight mt-0.5",
                VALUE_TONE[tone] || "text-ink",
            )}>
                {value}
            </p>
            {note && <p className="text-caption text-ink-3 mt-0.5 truncate">{note}</p>}
        </div>
    );
}
