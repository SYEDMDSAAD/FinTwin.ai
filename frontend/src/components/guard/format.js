/* Small helpers shared by the Spend Guard screens. */

export function inr(n) {
    const v = Number(n);
    if (n == null || Number.isNaN(v)) return "—";
    return (v < 0 ? "-" : "") + "₹" + Math.abs(Math.round(v)).toLocaleString("en-IN");
}

/** "449.50" → "₹449.50", "450.00" → "₹450": the exact amount the UPI app will show. */
export function inrExact(amount) {
    const v = Number(amount);
    if (Number.isNaN(v)) return "—";
    return Number.isInteger(v) ? inr(v) : "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const SOURCE_LABEL = {
    ai: "AI agent",
    fast_lane: "Fast lane",
    rules: "Fixed rule",
    fallback: "Fixed rules, AI unavailable",
    mock: "Mock, no AI",
};

export const FAST_LANE_REASON = {
    essential: "Essentials never wait",
    small: "Small payments never wait",
    pause_limit: "No more pauses today",
};

export function aiStatus(ai) {
    if (ai === "ready") return { label: "AI agents on", tone: "good" };
    if (ai === "mock") return { label: "Mock data, no AI", tone: "warn" };
    if (ai === "needs_vertex_for_real_data") return { label: "Fixed rules until Vertex AI is set up", tone: "warn" };
    return { label: "Fixed rules only", tone: "warn" };
}

/** What a UPI link says about the payee, for showing before the check. Display only:
    the server reads the code again and is the only one that decides. */
export function previewQr(raw) {
    try {
        const text = String(raw).trim();
        if (!/^upi:\/\/pay\?/i.test(text)) return null;
        const p = new URLSearchParams(text.slice(text.indexOf("?") + 1));
        const pa = p.get("pa") || "";
        if (!pa.includes("@")) return null;
        const am = Number(p.get("am"));
        return { pa, pn: p.get("pn") || "", am: am > 0 ? am : null };
    } catch {
        return null;
    }
}

/* Made-up merchants for trying the flow without a real QR code. The "@sample"
   handle belongs to no bank, and the screens never open a UPI app for these. */
export const SAMPLES = [
    { label: "Café, ₹450", qr: "upi://pay?pa=chaicorner@sample&pn=Chai%20Corner&mc=5814&cu=INR", amount: 450 },
    { label: "Clothes, ₹2,400", qr: "upi://pay?pa=urbanthreads@sample&pn=Urban%20Threads&mc=5651", amount: 2400 },
    { label: "Groceries, ₹1,800", qr: "upi://pay?pa=freshmart@sample&pn=FreshMart&mc=5411", amount: 1800 },
];

export function isSample(link) {
    const p = previewQr(link);
    return Boolean(p && p.pa.toLowerCase().endsWith("@sample"));
}

/** Hands the payment to the phone's UPI app (GPay, PhonePe, Paytm, a bank app). */
export function openUpi(link) {
    window.location.href = link;
}

export function hoursUntil(iso, now = Date.now()) {
    const h = Math.ceil((new Date(iso).getTime() - now) / 3600e3);
    return h > 0 ? h : 0;
}

export function shortTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("en-IN", { weekday: "short", hour: "numeric", minute: "2-digit" });
}
