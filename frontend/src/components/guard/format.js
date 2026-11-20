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
    user: "Your plan",
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
    { label: "A friend, ₹2,000", qr: "upi://pay?pa=rohan@sample&pn=Rohan", amount: 2000 },
    { label: "Betting app, ₹300", qr: "upi://pay?pa=luckyplay@sample&pn=LuckyPlay&mc=7995", amount: 300 },
];

// The same UPI ID rule guard-service applies (rules.VPA)
const UPI_ID = /^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$/;

/**
 * A typed UPI ID (and the payee's name, if given) as a plain UPI link, so it
 * goes through the same check as a scanned code. Only pa, pn and cu: no
 * merchant code or note can be typed in. Returns null for an invalid UPI ID.
 */
export function upiLinkFor(upiId, name = "") {
    const pa = String(upiId).trim();
    if (!UPI_ID.test(pa)) return null;
    const pn = String(name).trim().slice(0, 60);
    return `upi://pay?pa=${pa}${pn ? `&pn=${encodeURIComponent(pn)}` : ""}&cu=INR`;
}

export function isSample(link) {
    const p = previewQr(link);
    return Boolean(p && p.pa.toLowerCase().endsWith("@sample"));
}

/**
 * The UPI apps a payment is handed to: Google Pay first, PhonePe and Paytm
 * as backups when Google Pay isn't there. Android gets an intent for the
 * app's package (Chrome opens the Play Store if it isn't installed); iPhone
 * and iPad get the app's own scheme, since iOS sends a plain upi:// link to
 * whichever app claims it.
 */
export const UPI_APPS = [
    { id: "gpay", name: "Google Pay", android: "com.google.android.apps.nbu.paisa.user", ios: "gpay://upi/pay" },
    { id: "phonepe", name: "PhonePe", android: "com.phonepe.app", ios: "phonepe://pay" },
    { id: "paytm", name: "Paytm", android: "net.one97.paytm", ios: "paytmmp://pay" },
];
export const BACKUP_APPS = UPI_APPS.filter((a) => a.id !== "gpay");

/**
 * A upi://pay link aimed at one of UPI_APPS: the same payee, amount and note,
 * only the app changes. A computer has no UPI app, so the plain link is kept
 * for copying. Anything that isn't a UPI payment link, or an app not on the
 * list, gives null.
 */
const IOS = (ua, touch) => /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && touch > 1);   // iPadOS says "Mac"

/** A phone or tablet that can have a UPI app. A computer can't, so it gets a QR code to scan instead. */
export function isPhone(ua = globalThis.navigator?.userAgent || "", touch = globalThis.navigator?.maxTouchPoints || 0) {
    return /android/i.test(ua) || IOS(ua, touch);
}

export function upiAppLink(link, appId = "gpay", ua = globalThis.navigator?.userAgent || "",
                           touch = globalThis.navigator?.maxTouchPoints || 0) {
    const app = UPI_APPS.find((a) => a.id === appId);
    if (!app || typeof link !== "string" || !/^upi:\/\/pay\?/i.test(link)) return null;
    const query = link.slice(link.indexOf("?") + 1).replace(/#/g, "%23");
    if (/android/i.test(ua)) return `intent://pay?${query}#Intent;scheme=upi;package=${app.android};end`;
    if (IOS(ua, touch)) return `${app.ios}?${query}`;
    return link;
}

export function googlePayLink(link, ua, touch) {
    return upiAppLink(link, "gpay", ua, touch);
}

/** On a phone, hands the payment to a UPI app (Google Pay unless the user picked a backup); they approve it there with their PIN. */
export function openUpi(link, appId = "gpay") {
    const target = upiAppLink(link, appId);
    // A computer has no UPI app to open: the page shows the payment as a QR code instead
    if (target && isPhone()) window.location.href = target;
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
