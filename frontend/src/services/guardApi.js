import API from "./api";
import { storedUserIsDemo } from "../utils/demoGuard";

/* Spend Guard (prototype). The backend's /api/v1/guard/* forwards to the
   guard-service, and the feature stays hidden unless /guard/enabled says yes.

   Mock mode runs the screens with no backend or guard-service, on made-up
   data: build with VITE_GUARD_MOCK=1, or set localStorage
   "fintwin_guard_mock" to "1" in your own browser. */

export function guardMockOn() {
    if (import.meta.env.VITE_GUARD_MOCK === "1") return true;
    try {
        return localStorage.getItem("fintwin_guard_mock") === "1";
    } catch {
        return false;
    }
}

// One check per signed-in session; a new token (another login) checks again
let cached = { token: null, promise: null };

export function guardEnabled() {
    if (guardMockOn()) return Promise.resolve(true);
    const token = localStorage.getItem("token");
    // The shared demo account never has Spend Guard, so don't ask (the backend would say 403)
    if (!token || storedUserIsDemo()) return Promise.resolve(false);
    if (cached.token !== token || !cached.promise) {
        cached = {
            token,
            promise: API.get("/guard/enabled")
                .then((r) => r.data?.enabled === true)
                .catch(() => false),
        };
    }
    return cached.promise;
}

export function forgetGuardEnabled() {
    cached = { token: null, promise: null };
}

export async function guard(action, body = {}) {
    if (guardMockOn()) {
        const { mockGuard } = await import("./guardMock");
        return mockGuard(action, body);
    }
    const { data } = await API.post(`/guard/${action}`, body);
    return data;
}

/** The message to show for a failed call: the backend's own words when it sent some. */
export function guardError(err) {
    const d = err?.response?.data;
    const msg = d && (d.error || d.detail);
    return typeof msg === "string" && msg
        ? msg
        : "Spend Guard couldn't be reached. Try again in a moment.";
}
