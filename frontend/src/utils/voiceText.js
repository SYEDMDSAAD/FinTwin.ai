/*
 * The copilot's answer as speech: markdown dropped, cut into sentence-sized
 * pieces so the first one can play while the next is being voiced.
 */

export const MAX_SPOKEN = 600;

export function speakable(text) {
    let t = String(text || "")
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/^\s*#+\s*/gm, "")
        .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[*_`>|]/g, "")
        .replace(/\s*\n+\s*/g, ". ")
        .replace(/\.(\s*\.)+/g, ".")
        .replace(/[ \t]+/g, " ")
        .trim();
    if (t.length > MAX_SPOKEN) {
        const cut = t.slice(0, MAX_SPOKEN);
        const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
        t = end > 200 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "") + "…";
    }
    return t;
}

/** Sentence pieces of at least `min` characters (short ones join the next). */
export function pieces(text, min = 40) {
    // Split after an end mark followed by a space, so "₹1.7 lakh" stays whole
    const sentences = speakable(text).split(/(?<=[.!?…])\s+/).filter(Boolean);
    const out = [];
    let cur = "";
    for (const s of sentences) {
        cur = (cur + " " + s).trim();
        if (cur.length >= min) { out.push(cur); cur = ""; }
    }
    if (cur) {
        if (out.length && cur.length < 25) out[out.length - 1] += " " + cur;
        else out.push(cur);
    }
    return out;
}
