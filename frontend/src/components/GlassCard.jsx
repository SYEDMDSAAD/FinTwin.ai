function GlassCard({ children, className = "" }) {
    return (
        <div
            className={`rounded-2xl shadow-xl transition-all duration-200 ${className}`}
            style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-card)",
                backdropFilter: "blur(12px)",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-card-hover)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-card)"; }}
        >
            {children}
        </div>
    );
}

export default GlassCard;
