/*
 * Whether "Hey FinTwin" listens. Off by default, in the app and on the
 * website, until switched on in Settings: the wake word doesn't yet fire
 * reliably on real voices, and an always-on microphone costs battery and
 * shows the mic indicator for nothing. When on, listening happens on the
 * device and nothing is sent until the wake word.
 */

const KEY = "fintwin.voice.wake";
export const VOICE_PREF_EVENT = "fintwin:voice-pref";

export function wakePref() {
    try {
        const v = localStorage.getItem(KEY);
        if (v === "on") return true;
        if (v === "off") return false;
    } catch { /* storage blocked: fall back to the default */ }
    return false;
}

export function setWakePref(on) {
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* keep the default */ }
    window.dispatchEvent(new Event(VOICE_PREF_EVENT));
}
