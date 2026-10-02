import toast from "react-hot-toast";

// The demo's guard rails, with no dependency on the API client (which uses
// them), so the two don't import each other.

export const DEMO_ROLE = "DEMO";

export const isDemoUser = (user) => user?.role === DEMO_ROLE;

/** The signed-in user from storage, for code outside React (the API client). */
export function storedUserIsDemo() {
    try {
        return isDemoUser(JSON.parse(localStorage.getItem("user") || "{}"));
    } catch {
        return false;
    }
}

// ── Writes the read-only demo turns away ──────────────────────────────────────
// The backend answers them with code "demo_read_only". The API client shows
// one friendly message, and the page's own "Failed to …" toast for the same
// failure is held back, so the visitor sees why rather than an error.

let blockedAt = 0;

export function showDemoBlocked(message) {
    blockedAt = Date.now();
    toast(message || "This is a demo account, so nothing can be changed here. Sign up to do this with your own data.",
        { id: "demo-read-only", icon: "🔒", duration: 4000 });
}

/** Wraps toast.error so it stays quiet right after a demo block. Call once at startup. */
export function installDemoToastGuard() {
    const original = toast.error;
    if (original.__demoGuarded) return;
    const guarded = (message, options) => (Date.now() - blockedAt < 1500 ? undefined : original(message, options));
    guarded.__demoGuarded = true;
    toast.error = guarded;
}
