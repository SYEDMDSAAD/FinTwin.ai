import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

/**
 * Custom replacement for the native <select> used to pick a category.
 * Native selects hand the option list to the OS, which is slow/unstylable
 * on mobile — this renders its own list, so it opens instantly everywhere
 * and the highlight follows the pointer (or finger) consistently.
 */
export default function CategoryDropdown({
  value,
  options,
  onSelect,
  onCustomClick,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(-1);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const itemStyle = (highlighted, selected) => ({
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
    padding: "10px 12px", borderRadius: 10, fontSize: 15, cursor: "pointer",
    fontWeight: selected ? 600 : 400,
    color: selected ? "var(--accent)" : "var(--text-primary)",
    background: highlighted ? "var(--bg-input)" : "transparent",
  });

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 6, height: 44, padding: "0 12px", borderRadius: "var(--radius-control)", fontSize: 15, fontFamily: "inherit",
          cursor: disabled ? "wait" : "pointer", opacity: disabled ? 0.5 : 1,
          background: "var(--bg-input)", border: "1px solid transparent",
          color: "var(--text-primary)", boxSizing: "border-box",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value}
        </span>
        <ChevronDown
          size={16}
          style={{
            flexShrink: 0, color: "var(--text-dim)",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 40,
            maxHeight: 260, overflowY: "auto", borderRadius: 14, padding: 6,
            background: "var(--bg-card)",
            border: "1px solid var(--border-card)",
            boxShadow: "0 12px 32px rgba(17,17,26,0.12)",
          }}
        >
          {options.map((c, i) => (
            <div
              key={c}
              onClick={() => { onSelect(c); setOpen(false); }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(-1)}
              style={itemStyle(hovered === i, c === value)}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c}</span>
              {c === value && <Check size={16} style={{ flexShrink: 0 }} />}
            </div>
          ))}

          {onCustomClick && (
            <div
              onClick={() => { onCustomClick(); setOpen(false); }}
              onMouseEnter={() => setHovered("custom")}
              onMouseLeave={() => setHovered(-1)}
              style={{
                ...itemStyle(hovered === "custom", false),
                color: "var(--accent)", fontWeight: 600,
                borderTop: "1px solid var(--border-card)",
                borderRadius: hovered === "custom" ? 10 : 0,
                marginTop: 4, paddingTop: 8,
              }}
            >
              Custom category…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
