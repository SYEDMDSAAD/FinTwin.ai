import API from "../services/api";

export { DEMO_ROLE, isDemoUser } from "./demoGuard";

// "Try the demo": a shared, read-only account with sample data, entered with
// one click and no sign-up. The backend keeps visitors apart by a session id
// in the demo token; this file is the browser's side of it.

const VISITOR_KEY = "fintwin_visitor";

/** An anonymous id this browser keeps, so the admin page can count distinct visitors. */
export function visitorId() {
    try {
        let id = localStorage.getItem(VISITOR_KEY);
        if (!id) {
            id = typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
            localStorage.setItem(VISITOR_KEY, id);
        }
        return id;
    } catch {
        return null;
    }
}

/** Where the visitor came from: ?utm_source=, else the referring site (not our own). */
export function visitSource() {
    try {
        const utm = new URLSearchParams(window.location.search).get("utm_source");
        if (utm) return utm.toLowerCase();
        if (!document.referrer) return null;
        const host = new URL(document.referrer).hostname.replace(/^www\./, "");
        return host && host !== window.location.hostname ? host : null;
    } catch {
        return null;
    }
}

/**
 * Starts a demo session and signs into it. `login` is AuthContext's. The demo
 * has no refresh token: when its token expires the visitor starts a new demo.
 */
export async function startDemo(login) {
    const { data } = await API.post("/demo/start", { visitorId: visitorId(), source: visitSource() });
    // Open on the dashboard, where the sample data shows best
    localStorage.setItem("activeSection", "Dashboard");
    login(data.accessToken, { email: data.email, fullName: data.fullName, role: data.role });
}

/**
 * Counts a landing-page visit for the admin's Growth tab: the anonymous
 * visitor id and where they came from. Admins browsing their own site aren't
 * counted. Never fails loudly.
 */
export function recordVisit() {
    try {
        if (JSON.parse(localStorage.getItem("user") || "{}").role === "ADMIN") return;
    } catch { /* not signed in */ }
    const id = visitorId();
    if (id) API.post("/visits", { visitorId: id, source: visitSource() }).catch(() => {});
}

/** A page the demo visitor opened, or their click on "Sign up". Never fails loudly. */
export function demoEvent(kind, detail) {
    API.post("/demo/event", { kind, detail }).catch(() => {});
}
