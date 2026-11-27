import { useEffect, useState } from "react";
import API from "../services/api";

/* Pause → Invest helpers: open Future Twin, and the user's own portfolio XIRR. */

export function openFutureTwin() {
    try { localStorage.setItem("activeSection", "Future Twin"); } catch { /* storage blocked */ }
    window.dispatchEvent(new Event("dashboardNav"));
}

/** The user's own portfolio XIRR, or null. Fetched once per mount. */
export function useOwnXirr() {
    const [xirr, setXirr] = useState(null);
    useEffect(() => {
        let alive = true;
        API.get("/portfolio").then((r) => { if (alive) setXirr(r.data?.xirr ?? null); }).catch(() => {});
        return () => { alive = false; };
    }, []);
    return xirr;
}
