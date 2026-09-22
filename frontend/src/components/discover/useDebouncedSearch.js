import { useEffect, useRef, useState } from "react";
import API from "../../services/api";

/**
 * Search-as-you-type against a GET endpoint taking ?q=. Waits for a pause in
 * typing, ignores replies to queries the user has since changed, and is idle
 * below two characters.
 */
export function useDebouncedSearch(path, delay = 350) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [state, setState] = useState("idle");        // idle | loading | done | failed
    const seq = useRef(0);

    const q = query.trim();
    const tooShort = q.length < 2;

    useEffect(() => {
        if (tooShort) { seq.current++; return undefined; }   // drop any reply still in flight
        const mine = ++seq.current;
        const t = setTimeout(() => {
            setState("loading");
            API.get(path, { params: { q } })
                .then(r => { if (mine === seq.current) { setResults(Array.isArray(r.data) ? r.data : []); setState("done"); } })
                .catch(() => { if (mine === seq.current) setState("failed"); });
        }, delay);
        return () => clearTimeout(t);
    }, [q, tooShort, path, delay]);

    return { query, setQuery, results: tooShort ? [] : results, state: tooShort ? "idle" : state };
}
