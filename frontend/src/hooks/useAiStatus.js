import { useEffect, useState } from "react";

import API from "../services/api";

// Whether FinTwin AI is answering. It can be offline for hours at a time (it
// runs on a machine that may be switched off), so the copilot says so up front
// instead of letting a question fail.
export default function useAiStatus(intervalMs = 60_000) {

    const [available, setAvailable] = useState(true);

    useEffect(() => {

        let alive = true;

        const check = () =>
            API.get("/ai/status")
                .then((r) => { if (alive) setAvailable(r.data?.available !== false); })
                // Unknown is not offline: a failed send still explains itself
                .catch(() => {});

        check();
        const id = setInterval(check, intervalMs);
        window.addEventListener("focus", check);

        return () => {
            alive = false;
            clearInterval(id);
            window.removeEventListener("focus", check);
        };

    }, [intervalMs]);

    return available;
}
