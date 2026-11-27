/*
 * Whether "Hey FinTwin" listens. On in the Android app (it's an assistant
 * there), off on the website until switched on in Settings: a site asking
 * for the microphone as it loads would feel like spying. Either way the
 * listening happens on the device and nothing is sent until the wake word.
 */
import { isNativeApp } from "../native";

const KEY = "fintwin.voice.wake";
export const VOICE_PREF_EVENT = "fintwin:voice-pref";

export function wakePref() {
    try {
        const v = localStorage.getItem(KEY);
        if (v === "on") return true;
        if (v === "off") return false;
    } catch { /* storage blocked: fall back to the default */ }
    return isNativeApp();
}

export function setWakePref(on) {
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* keep the default */ }
    window.dispatchEvent(new Event(VOICE_PREF_EVENT));
}
