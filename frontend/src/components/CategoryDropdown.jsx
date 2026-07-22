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
    padding: "7px 10px", borderRadius: 7, fontSize: 12, cursor: "pointer",
    fontWeight: selected ? 700 : 500,
    color: selected ? "#a78bfa" : "var(--text-primary, #fff)",
    background: highlighted ? "rgba(59,130,246,0.25)" : "transparent",
  });

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 6, padding: "6px 10px", borderRadius: 8, fontSize: 12, fontFamily: "inherit",
          cursor: disabled ? "wait" : "pointer", opacity: disabled ? 0.5 : 1,
          background: "var(--bg-input)", border: "1px solid var(--border-subtle)",
          color: "var(--text-primary, #fff)", boxSizing: "border-box",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value}
        </span>
        <ChevronDown
          size={13}
          style={{
            flexShrink: 0, opacity: 0.6,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 40,
            maxHeight: 190, overflowY: "auto", borderRadius: 10, padding: 4,
            background: "var(--bg-floating, #0e1018)",
            border: "1px solid var(--border-floating, rgba(255,255,255,0.1))",
            boxShadow: "0 12px 28px rgba(0,0,0,0.35)",
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
              {c === value && <Check size={12} style={{ flexShrink: 0 }} />}
            </div>
          ))}

          {onCustomClick && (
            <div
              onClick={() => { onCustomClick(); setOpen(false); }}
              onMouseEnter={() => setHovered("custom")}
              onMouseLeave={() => setHovered(-1)}
              style={{
                ...itemStyle(hovered === "custom", false),
                color: "#a78bfa", fontWeight: 600,
                borderTop: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
                borderRadius: hovered === "custom" ? 7 : 0,
                marginTop: 4, paddingTop: 8,
              }}
            >
              ＋ Custom…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
