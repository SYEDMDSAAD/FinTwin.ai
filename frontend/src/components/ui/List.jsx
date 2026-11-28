import { ChevronRight } from "lucide-react";
import { cx } from "./cx";

/*
 * Grouped list: white rows on the canvas with hairline dividers, like a
 * phone's settings screen. The default way to show several items; prefer
 * it over a grid of small cards.
 */
export function List({ className, children, ...rest }) {
    return (
        <ul className={cx("rounded-card bg-surface border border-line overflow-hidden divide-y divide-line", className)} {...rest}>
            {children}
        </ul>
    );
}

const CHIP = {
    neutral: "bg-surface-sunken text-ink-2",
    accent: "bg-accent-soft text-accent",
    good: "bg-good-soft text-good",
    bad: "bg-bad-soft text-bad",
    warn: "bg-warn-soft text-warn",
    info: "bg-info-soft text-info",
};

/** A round icon in a soft tint. Use instead of emoji. */
export function IconChip({ icon: Icon, tone = "neutral", size = "md", className }) {
    const box = size === "sm" ? "w-8 h-8" : "w-10 h-10";
    return (
        <span className={cx("shrink-0 rounded-full flex items-center justify-center", box, CHIP[tone], className)}>
            <Icon size={size === "sm" ? 16 : 18} aria-hidden />
        </span>
    );
}

/**
 * One row: optional icon, a title with a line under it, and something on the
 * right (an amount, a badge). `onClick` makes it a button with a chevron;
 * `wrap` lets long text run onto more lines instead of being cut off.
 */
export function ListRow({ icon, tone, leading, title, subtitle, trailing, trailingNote, onClick, chevron, wrap, className }) {
    const Tag = onClick ? "button" : "div";
    return (
        <li>
            <Tag
                type={onClick ? "button" : undefined}
                onClick={onClick}
                className={cx(
                    "w-full flex items-center gap-3 px-4 py-3.5 text-left",
                    onClick && "hover:bg-surface-hover active:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:bg-surface-hover",
                    className,
                )}
            >
                {leading || (icon && <IconChip icon={icon} tone={tone} />)}
                <span className="min-w-0 flex-1">
                    <span className={cx("block text-body text-ink", wrap ? "leading-snug" : "truncate")}>{title}</span>
                    {subtitle && <span className={cx("block text-small text-ink-3 mt-0.5", !wrap && "truncate")}>{subtitle}</span>}
                </span>
                {(trailing != null || trailingNote) && (
                    <span className="shrink-0 text-right">
                        {trailing != null && <span className="block text-body text-ink num">{trailing}</span>}
                        {trailingNote && <span className="block text-small text-ink-3 mt-0.5">{trailingNote}</span>}
                    </span>
                )}
                {(chevron ?? !!onClick) && <ChevronRight size={18} aria-hidden className="shrink-0 text-ink-3 -mr-1" />}
            </Tag>
        </li>
    );
}
