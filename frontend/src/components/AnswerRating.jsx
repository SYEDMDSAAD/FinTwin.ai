import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import toast from "react-hot-toast";
import API from "../services/api";

// 👍 / 👎 under a copilot answer. A 👎 asks why, from a short fixed list, so
// the reasons can be counted. Rating the same way again takes it back.

const REASONS = [
    ["WRONG_NUMBERS", "Wrong numbers"],
    ["DIDNT_ANSWER", "Didn't answer my question"],
    ["NOT_USEFUL", "Not useful"],
    ["TOO_LONG", "Too long"],
    ["OTHER", "Something else"],
];

export default function AnswerRating({ exchangeId, initial = null }) {
    const [rating, setRating] = useState(initial);          // 1, -1 or null
    const [reason, setReason] = useState(null);
    const [askWhy, setAskWhy] = useState(false);
    const [busy, setBusy] = useState(false);

    const send = async (value, why = null) => {
        const before = { rating, reason };
        setBusy(true);
        setRating(value === 0 ? null : value);
        setReason(why);
        try {
            await API.put(`/transactions/chat/history/${exchangeId}/rating`,
                why ? { rating: value, reason: why } : { rating: value });
            if (value === 1) toast.success("Thanks for the feedback");
        } catch {
            setRating(before.rating);
            setReason(before.reason);
            toast.error("Couldn't save that. Try again.");
        } finally {
            setBusy(false);
        }
    };

    const up = () => { setAskWhy(false); send(rating === 1 ? 0 : 1); };
    const down = () => {
        if (rating === -1) { setAskWhy(false); send(0); return; }
        setAskWhy(true);
        send(-1);
    };
    const because = (code) => { setAskWhy(false); send(-1, code); toast.success("Thanks — that helps us fix it"); };

    const btn = (on, color) => ({
        display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28,
        borderRadius: 8, border: "none", cursor: busy ? "default" : "pointer",
        background: on ? `${color}22` : "transparent", color: on ? color : "var(--text-dim)",
    });

    return (
        <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <button type="button" aria-label="Helpful" aria-pressed={rating === 1} disabled={busy} onClick={up} style={btn(rating === 1, "#4ade80")}>
                    <ThumbsUp size={14} aria-hidden />
                </button>
                <button type="button" aria-label="Not helpful" aria-pressed={rating === -1} disabled={busy} onClick={down} style={btn(rating === -1, "#f87171")}>
                    <ThumbsDown size={14} aria-hidden />
                </button>
            </div>
            {askWhy && (
                <div role="group" aria-label="What was wrong?" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", alignSelf: "center", marginRight: 2 }}>What was wrong?</span>
                    {REASONS.map(([code, label]) => (
                        <button key={code} type="button" onClick={() => because(code)} aria-pressed={reason === code}
                                style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid var(--border-card)", background: "var(--bg-subtle)", color: "var(--text-primary)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                            {label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
