import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";

import { useAuth, useCurrentUser } from "../context/AuthContext";
import { demoEvent, isDemoUser } from "../utils/demo";

/**
 * Shown across the app in the demo account: what it is, and the way out to
 * the real thing. Also tells the admin page which sections demo visitors open.
 */
export default function DemoBanner({ section }) {
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
            <p className="min-w-0 flex-1 text-zinc-300">
                <span className="font-semibold text-white">You're exploring a demo account</span>
                {" "}with sample data. Look around and ask the copilot anything; nothing here is real or can be changed.
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
