import { cx } from "./cx";

/** What a section shows before there's anything in it, and how to start. */
export default function EmptyState({ icon: Icon, title, body, action, className }) {
    return (
        <div className={cx("flex flex-col items-center text-center px-6 py-10", className)}>
            {Icon && (
                <div className="w-12 h-12 rounded-full bg-surface-sunken text-ink-2 flex items-center justify-center mb-3">
                    <Icon size={22} aria-hidden />
                </div>
            )}
            <p className="text-heading text-ink">{title}</p>
            {body && <p className="text-small text-ink-3 mt-1 max-w-sm">{body}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}
