import { cx } from "./cx";

const TONE = {
    neutral: "bg-surface-sunken text-ink-2",
    accent: "bg-accent-soft text-accent",
    good: "bg-good-soft text-good",
    bad: "bg-bad-soft text-bad",
    warn: "bg-warn-soft text-warn",
    info: "bg-info-soft text-info",
};

/** A short status label: "Over budget", "New", "Paused". */
export default function Badge({ tone = "neutral", className, children }) {
    return (
        <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap", TONE[tone], className)}>
            {children}
        </span>
    );
}
