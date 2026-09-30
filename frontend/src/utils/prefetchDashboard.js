// The dashboard's code, with the charts and animation libraries it needs, is
// ~300 KB gzipped. Loaded only when the user taps "Open Dashboard" or signs in,
// that download is several seconds on a phone. Starting it earlier, while
// they're still on the landing or login page, makes the tap feel instant.
//
// App's lazy() route uses the same loader, so it's one download either way.
export const loadDashboard = () => import("../pages/Dashboard");

let started = false;

/**
 * Starts downloading the dashboard's code. `whenIdle` waits until the browser
 * is idle and skips data-saver and 2G connections, where only a tap should
 * spend the user's data.
 */
export function prefetchDashboard({ whenIdle = false } = {}) {
    if (started || import.meta.env.MODE === "test") return;
    const conn = typeof navigator !== "undefined" ? navigator.connection : undefined;
    if (whenIdle && conn && (conn.saveData || /2g/.test(conn.effectiveType || ""))) return;

    const go = () => {
        if (started) return;
        started = true;
        loadDashboard().catch(() => { started = false; });  // a failed fetch may retry
    };
    if (!whenIdle) return go();
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1500));
    idle(go, { timeout: 4000 });
}
