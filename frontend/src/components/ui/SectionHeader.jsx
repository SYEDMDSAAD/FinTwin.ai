import { cx } from "./cx";

/**
 * The heading inside a screen: a title, an optional line under it, and an
 * optional action on the right. The screen's own name is in TabHeader, so
 * this is an h2.
 */
export default function SectionHeader({ title, subtitle, action, className }) {
    return (
        <div className={cx("flex items-end justify-between gap-3 mb-2 px-1", className)}>
            <div className="min-w-0">
                <h2 className="text-[18px] leading-tight font-[650] tracking-[-0.015em] text-ink">{title}</h2>
                {subtitle && <p className="text-small text-ink-3 mt-0.5">{subtitle}</p>}
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
}
