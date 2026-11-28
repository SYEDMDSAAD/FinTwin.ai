import { cx } from "./cx";

const VARIANT = {
    // text-accent-on, not text-white: the light theme repaints .text-white dark
    primary: "bg-accent-strong text-accent-on hover:brightness-110 active:brightness-95",
    secondary: "bg-surface-sunken text-ink hover:brightness-[0.97] active:brightness-95",
    soft: "bg-accent-soft text-accent hover:brightness-[0.97]",
    ghost: "text-accent hover:bg-accent-soft",
    danger: "bg-bad-soft text-bad hover:brightness-[0.97]",
};
const SIZE = {
    sm: "h-9 px-3.5 text-small gap-1.5",
    md: "h-11 px-5 text-body gap-2",
    lg: "h-12 px-6 text-body gap-2 w-full",
};

/** Every button in the app: primary for the one main action on a screen. */
export default function Button({ variant = "primary", size = "md", icon: Icon, className, children, type = "button", ...rest }) {
    return (
        <button
            type={type}
            className={cx(
                "inline-flex items-center justify-center rounded-full font-semibold transition whitespace-nowrap",
                "disabled:opacity-50 disabled:pointer-events-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
                VARIANT[variant], SIZE[size], className,
            )}
            {...rest}
        >
            {Icon && <Icon size={size === "sm" ? 14 : 16} aria-hidden />}
            {children}
        </button>
    );
}
