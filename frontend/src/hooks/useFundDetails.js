import { useEffect, useState } from "react";
import API from "../services/api";

/**
 * The AMFI facts (category, past returns) for each mutual fund the user
 * holds with a scheme code, fetched once for all the Insights cards.
 * → null while loading, then [{ holding, fund }] (fund null when unavailable).
 */
export default function useFundDetails(holdings) {
    const funds = (holdings || []).filter((h) => h.type === "Mutual Fund" && /^\d{1,10}$/.test((h.tickerCode || "").trim()));
    const key = funds.map((f) => `${f.id}:${f.tickerCode.trim()}`).join(",");
    const [state, setState] = useState({ key: null, rows: null });

    useEffect(() => {
        if (!key) return;
        let alive = true;
        const list = key.split(",").map((p) => p.split(":"));
        Promise.all(list.map(([, code]) => API.get(`/discover/funds/${code}`).then((r) => r.data).catch(() => null)))
            .then((details) => { if (alive) setState({ key, rows: details }); });
        return () => { alive = false; };
    }, [key]);

    if (!key) return [];
    if (state.key !== key || !state.rows) return null;
    return funds.map((holding, i) => ({ holding, fund: state.rows[i] }));
}
