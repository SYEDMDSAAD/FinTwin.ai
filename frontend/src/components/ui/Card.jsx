import { cx } from "./cx";

// Written out in full so Tailwind finds every class
const TONE = {
    accent: "bg-accent-soft border-transparent",
    good: "bg-good-soft border-transparent",
    bad: "bg-bad-soft border-transparent",
    warn: "bg-warn-soft border-transparent",
    info: "bg-info-soft border-transparent",
};
const PAD = { none: "", sm: "p-3", md: "p-4 md:p-5", lg: "p-5 md:p-6" };

/**
 * The one container for content. `onClick` makes the whole card a button;
 * `tone` tints it for a highlighted card (good, bad, warn, info, accent).
 */
export default function Card({ as, onClick, tone, pad = "md", className, children, ...rest }) {
    const Tag = as || (onClick ? "button" : "section");
    return (
        <Tag
            type={Tag === "button" ? "button" : undefined}
            onClick={onClick}
            className={cx(
                "block w-full text-left rounded-card border",
                TONE[tone] || "bg-surface border-line",
                onClick && "transition-colors hover:border-line-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                PAD[pad],
                className,
            )}
            {...rest}
        >
            {children}
        </Tag>
    );
}
