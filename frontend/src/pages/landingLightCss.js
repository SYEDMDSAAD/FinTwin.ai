// The landing page's stylesheet was written for dark only. Its light version
// is derived from it, colour by colour, so the two can't drift apart when the
// page changes: page backgrounds become near-white, light text becomes dark,
// white overlays become white cards with dark hairlines, and accent text is
// darkened enough to read on white. Gradients and brand fills are left as they
// are — they work on both.

const rgba = (r, g, b, a) => `rgba(${r},${g},${b},${a})`;
const round = (n) => Math.round(n * 100) / 100;

// Accent text colours → darker shades of the same hue (WCAG AA on white)
const ACCENT_TEXT = {
    "#a78bfa": "#6d28d9", "#c4b5fd": "#6d28d9", "#fbbf24": "#b45309", "#f59e0b": "#b45309",
    "#22d3ee": "#0e7490", "#4ade80": "#15803d", "#f87171": "#dc2626",
};

function mapColor(prop, color) {
    const c = color.replace(/\s+/g, "").toLowerCase();
    const isText = prop === "color";
    const isBorder = prop.startsWith("border") || prop.startsWith("outline");
    const isShadow = prop.includes("shadow");

    // Page backgrounds
    if (c === "#060810") return "#f6f7fb";
    let m = c.match(/^rgba\(6,8,16,([\d.]+)\)$/);
    if (m) return +m[1] >= 1 ? "#f6f7fb" : rgba(255, 255, 255, 0.92);

    // Light text → dark text
    if (c === "#f1f5f9" || c === "#e2e8f0") return isText || prop === "background" ? "#0f172a" : color;
    m = c.match(/^rgba\(226,232,240,([\d.]+)\)$/);
    if (m) return rgba(15, 23, 42, m[1]);
    m = c.match(/^rgba\(148,163,184,([\d.]+)\)$/);
    if (m) return rgba(51, 65, 85, round(Math.min(1, +m[1] + 0.1)));
    m = c.match(/^rgba\(100,116,139,([\d.]+)\)$/);
    if (m) return rgba(71, 85, 105, round(Math.min(1, +m[1] + 0.2)));

    // White overlays: faint panels become white cards; borders and hover
    // tints become dark hairlines
    m = c.match(/^rgba\(255,255,255,([\d.]+)\)$/);
    if (m) {
        const a = +m[1];
        if (isBorder) return rgba(15, 23, 42, round(Math.min(0.2, a + 0.04)));
        if (isText) return rgba(15, 23, 42, round(Math.min(1, a + 0.3)));
        return a <= 0.04 ? rgba(255, 255, 255, 0.85) : rgba(15, 23, 42, round(a * 0.6));
    }

    // Black: shadows are far too heavy on white; recessed panels become a faint tint
    m = c.match(/^rgba\(0,0,0,([\d.]+)\)$/);
    if (m && isShadow) return rgba(15, 23, 42, round(+m[1] * 0.3));
    if (m) return rgba(15, 23, 42, 0.04);

    // The call-to-action band's dark purple middle
    if (c === "#0a0614") return "#efe9fb";

    // Accent-tinted text needs more strength on white
    if (isText && ACCENT_TEXT[c]) return ACCENT_TEXT[c];
    m = c.match(/^rgba\(167,139,250,([\d.]+)\)$/);
    if (m && isText) return rgba(109, 40, 217, round(Math.min(1, +m[1] + 0.2)));
    m = c.match(/^rgba\((34,211,238|248,113,113|74,222,128),([\d.]+)\)$/);
    if (m && isText) return { "34,211,238": "#0e7490", "248,113,113": "#dc2626", "74,222,128": "#15803d" }[m[1]];

    return color;
}

const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;

/** The light version of a stylesheet written for dark. */
export function toLight(css) {
    // property: value — selectors like "a:hover {" never reach a colour, so pass through
    return css.replace(/([a-z-]+)(\s*:\s*)([^;{}]+)/gi, (all, prop, sep, value) =>
        prop + sep + value.replace(COLOR, (col) => mapColor(prop.toLowerCase(), col)));
}
