import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";

import { useAuth, useCurrentUser } from "../context/AuthContext";
import { demoEvent, isDemoUser } from "../utils/demo";

/**
 * Shown across the app in the demo account: what it is, and the way out to
 * the real thing. Also tells the admin page which sections demo visitors open.
 */
export default function DemoBanner({ section, onOpenGuard }) {
    const user = useCurrentUser();
    const auth = useAuth();
    const navigate = useNavigate();
    const demo = isDemoUser(user);

    useEffect(() => {
        if (demo && section) demoEvent("page", section);
    }, [demo, section]);

    if (!demo) return null;

    const signUp = async () => {
        demoEvent("signup_click", section);
        await auth?.logout();
        navigate("/register");
    };

    return (
        <div
            role="status"
            className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-purple-400/25 bg-purple-500/[0.08] px-4 py-3 text-sm"
        >
            <Sparkles size={16} className="shrink-0 text-purple-400" aria-hidden />
            {/* min width: on a phone the button wraps below instead of squeezing the text to a word per line */}
            <p className="min-w-[12rem] flex-1 basis-[16rem] text-zinc-300">
                <span className="font-semibold text-white">You're exploring a demo account</span>
                {" "}with sample data. Look around and ask the copilot anything; nothing here is real or can be changed.
                {section !== "Spend Guard" && onOpenGuard && (
                    <>
                        {" "}<span className="font-semibold text-white">New:</span>{" "}
                        <button type="button" onClick={onOpenGuard}
                                className="font-semibold text-green-400 underline underline-offset-2">
                            try Spend Guard
                        </button>, which checks a payment before you pay.
                    </>
                )}
            </p>
            <button
                onClick={signUp}
                className="shrink-0 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(139,92,246,0.35)] transition hover:scale-[1.02]"
            >
                Sign up and use your own data
            </button>
        </div>
    );
}
