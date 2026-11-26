import { Capacitor, registerPlugin } from "@capacitor/core";
import API from "./api";
import { storedUserIsDemo } from "../utils/demoGuard";

/* Bank SMS → transactions, Android app only.

   The native SmsReader plugin passes on only messages from registered
   business senders that mention an amount; the backend keeps known banks
   and completed transactions, and skips anything already on record. The
   newest message time is remembered per user, so each sync reads only what
   arrived since. A first sync goes back FIRST_SYNC_DAYS. */

const SmsReader = registerPlugin("SmsReader");

export const FIRST_SYNC_DAYS = 90;
const BATCH = 400;
const DAY = 86_400_000;

export function smsAvailable() {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function userKey() {
    try {
        const u = JSON.parse(localStorage.getItem("user") || "{}");
        return u.email ? `fintwin_sms_since:${u.email.toLowerCase()}` : null;
    } catch {
        return null;
    }
}

export function lastSync() {
    const key = userKey();
    const at = key && Number(localStorage.getItem(key + ":at"));
    return at || null;
}

/** "granted" | "denied" | "prompt" | "prompt-with-rationale" | "unavailable" */
export async function smsPermission() {
    if (!smsAvailable()) return "unavailable";
    const { sms } = await SmsReader.checkPermissions();
    return sms;
}

export async function requestSmsPermission() {
    if (!smsAvailable()) return "unavailable";
    const { sms } = await SmsReader.requestPermissions({ permissions: ["sms"] });
    return sms;
}

let running = null;

/** Reads new bank SMS and imports them; resolves to the summed counts. One sync at a time. */
export function syncSms({ now = Date.now() } = {}) {
    if (!running) running = doSync(now).finally(() => { running = null; });
    return running;
}

async function doSync(now) {
    const key = userKey();
    if (!smsAvailable() || !key || !localStorage.getItem("token") || storedUserIsDemo()) return null;
    if ((await smsPermission()) !== "granted") return null;

    const since = Number(localStorage.getItem(key)) || now - FIRST_SYNC_DAYS * DAY;
    const { messages = [] } = await SmsReader.inbox({ since, limit: 5000 });

    const total = { imported: 0, duplicates: 0, onRecord: 0, notBank: 0, notTransaction: 0, read: messages.length };
    for (let i = 0; i < messages.length; i += BATCH) {
        const batch = messages.slice(i, i + BATCH);
        const { data } = await API.post("/sms/import", { messages: batch });
        for (const k of ["imported", "duplicates", "onRecord", "notBank", "notTransaction"]) total[k] += data?.[k] || 0;
        // Saved after every batch, so a failure part-way resumes where it stopped
        localStorage.setItem(key, String(batch[batch.length - 1].receivedAt));
    }
    if (!messages.length && !localStorage.getItem(key)) localStorage.setItem(key, String(since));
    localStorage.setItem(key + ":at", String(now));
    if (total.imported > 0) window.dispatchEvent(new CustomEvent("fintwin:transactions-changed"));
    return total;
}

/** While signed in: sync now and whenever the app comes back to the front. Returns a stop function. */
export function startSmsAutoSync() {
    if (!smsAvailable()) return () => {};
    const quiet = () => syncSms().catch(() => {});
    quiet();
    let handle = null;
    let stopped = false;
    import("@capacitor/app").then(({ App }) => App.addListener("resume", quiet)).then((h) => {
        if (stopped) h.remove(); else handle = h;
    });
    return () => { stopped = true; handle?.remove(); };
}
