import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCurrentUser } from "../context/AuthContext";
import { routeFor, openRoute } from "../utils/voiceRoute";
import { wakePref, VOICE_PREF_EVENT } from "../utils/voicePref";
import * as voice from "../services/voice";
import { startWakeWord } from "../services/wakeWord";

/*
 * "Hey FinTwin": a voice assistant, not a chat box.
 *
 *   You:     "Hey FinTwin"
 *   FinTwin: "Yes, hi Saad. How can I help you today?"
 *   You:     "Show my portfolio"
 *   FinTwin opens Investments → My Portfolio and says, in a sentence or two,
 *            how it's doing. Nothing is written on screen.
 *
 * Listens only while FinTwin is open and on screen; the wake word is spotted
 * on the device and nothing is sent until it's heard (services/wakeWord.js).
 * A small glowing dot shows while it's listening or talking; tap it to stop.
 * Switched on or off in Settings (utils/voicePref.js).
 */

const firstName = (user) => String(user?.fullName || "").trim().split(/\s+/)[0] || "";

export const greeting = (name) => (name ? `Yes, hi ${name}. How can I help you today?` : "Yes? How can I help you today?");
export const MISSED = "Sorry, I didn't catch that. Say Hey FinTwin and try again.";
export const TROUBLE = "Sorry, I can't answer that right now. Please try again in a moment.";

const LABEL = {
    greeting: "FinTwin is listening",
    listening: "FinTwin is listening",
    thinking: "FinTwin is thinking",
    speaking: "FinTwin is answering",
};

export default function VoiceAssistant() {
    const name = firstName(useCurrentUser());
    const [enabled, setEnabled] = useState(() => voice.wakeWordConfigured() && wakePref());
    // idle | greeting | listening | thinking | speaking
    const [phase, setPhase] = useState("idle");
    const [level, setLevel] = useState(0);

    const wake = useRef(null);
    const current = useRef(null);
    const busy = useRef(false);
    const run = useRef(0);

    useEffect(() => {
        const onPref = () => setEnabled(voice.wakeWordConfigured() && wakePref());
        window.addEventListener(VOICE_PREF_EVENT, onPref);
        return () => window.removeEventListener(VOICE_PREF_EVENT, onPref);
    }, []);

    // The phrases are voiced ahead, so "Yes, hi…" plays the moment it's called
    useEffect(() => {
        if (!enabled) return;
        voice.phrase(greeting(name));
        voice.phrase(MISSED);
    }, [enabled, name]);

    const say = useCallback(async (text) => {
        const blob = await voice.phrase(text);
        if (!blob) { voice.chime(); return; }
        current.current = voice.play(blob);
        await current.current.done;
    }, []);

    const stop = useCallback(() => {
        run.current++;
        current.current?.stop();
        busy.current = false;
        setPhase("idle");
        setLevel(0);
        if (document.visibilityState === "visible") wake.current?.resume().catch(() => {});
    }, []);

    const converse = useCallback(async () => {
        if (busy.current) return;
        busy.current = true;
        const me = ++run.current;
        const still = () => run.current === me;
        await wake.current?.pause();
        try {
            setPhase("greeting");
            await say(greeting(name));
            if (!still()) return;

            setPhase("listening");
            const rec = voice.recordQuestion({ onLevel: setLevel });
            current.current = rec;
            const blob = await rec.done;
            setLevel(0);
            if (!still()) return;
            setPhase("thinking");
            const question = blob ? await voice.transcribe(blob) : "";
            if (!still()) return;
            if (!question) { setPhase("speaking"); await say(MISSED); return; }

            openRoute(routeFor(question));
            const reply = await voice.ask(question);
            if (!still()) return;
            setPhase("speaking");
            current.current = voice.speak(reply);
            await current.current.done;
        } catch {
            if (still()) { setPhase("speaking"); await say(TROUBLE).catch(() => {}); }
        } finally {
            if (still()) {
                busy.current = false;
                setPhase("idle");
                setLevel(0);
                if (document.visibilityState === "visible") wake.current?.resume().catch(() => {});
            }
        }
    }, [name, say]);

    // Listening for the wake word: while switched on and the app is on screen
    useEffect(() => {
        if (!enabled) return undefined;
        let cancelled = false;
        const begin = async () => {
            if (wake.current || cancelled || document.visibilityState !== "visible") return;
            try {
                const w = await startWakeWord(() => converse());
                if (cancelled) { w.release(); return; }
                wake.current = w;
            } catch { /* no microphone or no WebAssembly here: voice stays off */ }
        };
        const end = async () => {
            const w = wake.current;
            wake.current = null;
            await w?.release().catch(() => {});
        };
        const onVisibility = () => {
            if (document.visibilityState === "visible") begin();
            else { run.current++; current.current?.stop(); busy.current = false; setPhase("idle"); end(); }
        };
        begin();
        document.addEventListener("visibilitychange", onVisibility);
        return () => { cancelled = true; document.removeEventListener("visibilitychange", onVisibility); end(); };
    }, [enabled, converse]);

    useEffect(() => () => { run.current++; current.current?.stop(); }, []);

    if (phase === "idle") return null;
    const size = 14 + (phase === "listening" ? level * 10 : 0);
    return createPortal(
        <button type="button" onClick={stop} aria-label={`${LABEL[phase]}. Tap to stop.`}
                className="fixed z-[205] left-1/2 -translate-x-1/2 bottom-[calc(84px+env(safe-area-inset-bottom,0px))] md:bottom-8 h-11 w-11 flex items-center justify-center rounded-full">
            <span aria-hidden className={phase === "thinking" ? "animate-pulse" : ""}
                  style={{ width: size, height: size, borderRadius: "50%", background: "var(--accent-strong)",
                           boxShadow: "0 0 0 6px color-mix(in srgb, var(--accent) 22%, transparent), 0 0 24px var(--accent)",
                           transition: "width 90ms, height 90ms" }} />
            <span className="sr-only" role="status">{LABEL[phase]}</span>
        </button>,
        document.body,
    );
}
