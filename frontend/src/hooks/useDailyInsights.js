import { useEffect, useState } from "react";
import { localPrefs, fetchAiPrefs, AI_PREFS_EVENT } from "../services/aiPrefs";

/** Whether Home shows the daily recap: Settings → AI preferences, kept on the server. */
export default function useDailyInsights() {
    const [on, setOn] = useState(() => localPrefs().dailyInsights);
    useEffect(() => {
        let live = true;
        fetchAiPrefs().then((p) => { if (live) setOn(p.dailyInsights); });
        const onPrefs = () => setOn(localPrefs().dailyInsights);
        window.addEventListener(AI_PREFS_EVENT, onPrefs);
        return () => { live = false; window.removeEventListener(AI_PREFS_EVENT, onPrefs); };
    }, []);
    return on;
}
