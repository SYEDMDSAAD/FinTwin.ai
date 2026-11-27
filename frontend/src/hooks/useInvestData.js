import { useEffect, useState } from "react";
import API from "../services/api";
import { sipApi } from "../services/trackedHoldings";

/**
 * What Home needs about investing, loaded together: the portfolio summary,
 * value over time, SIPs and the health check. Each part fails on its own,
 * so a slow price feed never blanks the rest of Home.
 */
export default function useInvestData() {
    const [data, setData] = useState({ portfolio: null, history: null, sips: [], health: null, loading: true });

    useEffect(() => {
        let live = true;
        Promise.all([
            API.get("/portfolio").then((r) => r.data).catch(() => null),
            API.get("/portfolio/history").then((r) => r.data).catch(() => null),
            sipApi.list().catch(() => []),
            API.get("/portfolio/health").then((r) => r.data).catch(() => null),
        ]).then(([portfolio, history, sips, health]) => {
            if (live) setData({ portfolio, history, sips: sips || [], health, loading: false });
        });
        return () => { live = false; };
    }, []);

    return data;
}
