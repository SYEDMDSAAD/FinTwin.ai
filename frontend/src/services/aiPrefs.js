/*
 * AI preferences: the Copilot's default mode and whether Home shows the
 * daily recap. The server keeps them (they follow the user to another phone
 * or the website); localStorage holds a copy so the first paint is right.
 */
import API from "./api";
import { AI_MODE_IDS } from "../constants/aiModes";

export const DEFAULT_MODE = "Savings Advisor";
export const AI_PREFS_EVENT = "fintwin:ai-prefs";

/** Onboarding once stored a JSON list, Settings a plain string: either reads. */
export function parseMode(raw) {
    if (!raw) return DEFAULT_MODE;
    let v = raw;
    if (raw.startsWith("[")) {
        try { v = JSON.parse(raw)[0]; } catch { v = null; }
    }
    return AI_MODE_IDS.includes(v) ? v : DEFAULT_MODE;
}

export function localPrefs() {
    try {
        return {
            mode: parseMode(localStorage.getItem("aiMode")),
            dailyInsights: localStorage.getItem("dailyInsights") !== "false",
        };
    } catch {
        return { mode: DEFAULT_MODE, dailyInsights: true };
    }
}

function remember({ mode, dailyInsights }) {
    try {
        if (mode) localStorage.setItem("aiMode", mode);
        if (typeof dailyInsights === "boolean") localStorage.setItem("dailyInsights", String(dailyInsights));
    } catch { /* storage blocked: the server copy still holds */ }
    window.dispatchEvent(new Event(AI_PREFS_EVENT));
}

/** The server's copy, remembered locally; the local one if the server can't be reached. */
export async function fetchAiPrefs() {
    try {
        const { data } = await API.get("/profile/ai-preferences");
        const prefs = { mode: parseMode(data?.mode), dailyInsights: data?.dailyInsights !== false };
        remember(prefs);
        return prefs;
    } catch {
        return localPrefs();
    }
}

/** Saves on the server; throws if it couldn't (the local copy is kept either way). */
export async function saveAiPrefs(prefs) {
    remember(prefs);
    await API.put("/profile/ai-preferences", prefs);
}
