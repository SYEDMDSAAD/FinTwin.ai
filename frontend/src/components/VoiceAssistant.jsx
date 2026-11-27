import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Mic, X, Square } from "lucide-react";
import { Button, cx } from "./ui";
import { routeFor, openRoute } from "../utils/voiceRoute";
import * as voice from "../services/voice";
import { startWakeWord } from "../services/wakeWord";

/*
 * "Hey FinTwin": ask anything about your FinTwin out loud.
 *
 * Tap the mic, or (once switched on) say "Hey FinTwin". The question is
 * recorded until you stop talking, written down, answered by the copilot in
 * voice mode, and read aloud; the page it's about opens straight away.
 *
 * Listening for the wake word is off by default, runs only while FinTwin is
 * open and on screen, and shows a "Listening for Hey FinTwin" pill whenever
 * the microphone is in use. Nothing is sent before the wake word or a tap.
 */

const PREF = "fintwin.voice.wake";
const readPref = () => { try { return localStorage.getItem(PREF) === "on"; } catch { return false; } };
const writePref = (on) => { try { localStorage.setItem(PREF, on ? "on" : "off"); } catch { /* keep in memory */ } };

const errorText = (e) =>
    e?.response?.data?.message || e?.response?.data?.reply
    || (e?.name === "NotAllowedError" ? "FinTwin needs the microphone. Allow it in your browser or phone settings." : null)
    || "Something went wrong. Try again, or type your question in the copilot.";

export default function VoiceAssistant() {
    // idle | recording | thinking | speaking | done | error
    const [phase, setPhase] = useState("idle");
    const [open, setOpen] = useState(false);
    const [heard, setHeard] = useState("");
    const [answer, setAnswer] = useState("");
    const [went, setWent] = useState(null);
    const [problem, setProblem] = useState("");
    const [level, setLevel] = useState(0);
    const [wakeOn, setWakeOn] = useState(() => voice.wakeWordConfigured() && readPref());
    const [wakeLive, setWakeLive] = useState(false);
    const [wakeProblem, setWakeProblem] = useState("");

    const wake = useRef(null);
    const rec = useRef(null);
    const talk = useRef(null);
    const busy = useRef(false);
    const run = useRef(0);

    const stopAll = useCallback(() => {
        run.current++;
        rec.current?.stop();
        talk.current?.stop();
        busy.current = false;
    }, []);

    const askAloud = useCallback(async () => {
        if (busy.current || !voice.canRecord()) return;
        busy.current = true;
        const me = ++run.current;
        const still = () => run.current === me;
        setOpen(true);
        setHeard(""); setAnswer(""); setWent(null); setProblem("");
        await wake.current?.pause();
        try {
            voice.chime();
            setPhase("recording");
            rec.current = voice.recordQuestion({ onLevel: setLevel });
            const blob = await rec.current.done;
            setLevel(0);
            if (!still()) return;
            if (!blob) { setProblem("I didn't catch that. Tap the mic and ask again."); setPhase("error"); return; }
            setPhase("thinking");
            const question = await voice.transcribe(blob);
            if (!still()) return;
            if (!question) { setProblem("I didn't catch that. Tap the mic and ask again."); setPhase("error"); return; }
            setHeard(question);
            const route = routeFor(question);
            if (route) { openRoute(route); setWent(route); }
            const reply = await voice.ask(question);
            if (!still()) return;
            setAnswer(reply);
            setPhase("speaking");
            talk.current = voice.speak(reply);
            await talk.current.done;
            if (still()) setPhase("done");
        } catch (e) {
            if (still()) { setProblem(errorText(e)); setPhase("error"); }
        } finally {
            if (still()) busy.current = false;
            setLevel(0);
            if (document.visibilityState === "visible") wake.current?.resume().catch(() => {});
        }
    }, []);

    // The wake word: on while switched on and the app is on screen
    useEffect(() => {
        if (!wakeOn) return undefined;
        let cancelled = false;
        const start = async () => {
            if (wake.current || cancelled || document.visibilityState !== "visible") return;
            try {
                setWakeProblem("Getting “Hey FinTwin” ready… (the first time downloads about 15 MB)");
                const w = await startWakeWord(() => askAloud(), () => setWakeProblem("“Hey FinTwin” stopped. Switch it off and on again."));
                if (cancelled) { w.release(); return; }
                wake.current = w;
                setWakeLive(true);
                setWakeProblem("");
            } catch (e) {
                setWakeProblem(e?.name === "NotAllowedError"
                    ? "FinTwin needs the microphone to hear “Hey FinTwin”."
                    : "Couldn't start “Hey FinTwin” on this device. Tap the mic instead.");
                setWakeLive(false);
            }
        };
        const stop = async () => {
            const w = wake.current;
            wake.current = null;
            setWakeLive(false);
            await w?.release().catch(() => {});
        };
        const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());
        start();
        document.addEventListener("visibilitychange", onVisibility);
        return () => { cancelled = true; document.removeEventListener("visibilitychange", onVisibility); stop(); };
    }, [wakeOn, askAloud]);

    useEffect(() => () => stopAll(), [stopAll]);

    const toggleWake = (on) => { writePref(on); setWakeOn(on); if (!on) setWakeProblem(""); };
    const close = () => { stopAll(); setOpen(false); setPhase("idle"); };

    if (!voice.canRecord()) return null;

    const status = {
        recording: "Listening… ask your question",
        thinking: heard ? "Thinking…" : "Getting that down…",
        speaking: "",
        done: "",
        error: "",
        idle: "",
    }[phase];

    return createPortal(
        <>
            {wakeLive && phase === "idle" && !open && (
                <div role="status" className="fixed z-[210] left-1/2 -translate-x-1/2 top-3 rounded-full bg-surface-raised border border-line shadow-raised px-3 py-1 text-caption text-ink-2 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden /> Listening for “Hey FinTwin”
                </div>
            )}

            <button type="button" aria-label={open ? "Close voice" : "Ask FinTwin out loud"}
                    onClick={() => (open ? close() : askAloud())}
                    className="fixed z-[205] right-4 md:right-6 bottom-[calc(80px+env(safe-area-inset-bottom,0px))] md:bottom-6 h-13 w-13 rounded-full flex items-center justify-center shadow-raised"
                    style={{ width: 52, height: 52, background: "var(--accent-strong)", color: "#fff",
                             boxShadow: phase === "recording" ? `0 0 0 ${4 + level * 14}px color-mix(in srgb, var(--accent) 30%, transparent)` : undefined }}>
                {open ? <X size={22} /> : <Mic size={22} />}
            </button>

            {open && (
                <section aria-label="FinTwin voice" aria-live="polite"
                         className="fixed z-[204] right-4 md:right-6 left-4 md:left-auto md:w-[380px] bottom-[calc(144px+env(safe-area-inset-bottom,0px))] md:bottom-[88px] rounded-card bg-surface-raised border border-line shadow-raised p-4 space-y-3">
                    {heard && <p className="text-small text-ink-3">“{heard}”</p>}
                    {status && <p className="text-body text-ink-2">{status}</p>}
                    {answer && <p className="text-body text-ink whitespace-pre-line max-h-[40vh] overflow-y-auto">{answer}</p>}
                    {problem && <p className="text-body text-ink-2">{problem}</p>}
                    {went && <p className="text-caption text-ink-3">Opened {went.label}.</p>}
                    <div className="flex items-center gap-2 flex-wrap">
                        {phase === "speaking" && (
                            <Button size="sm" variant="secondary" onClick={() => { talk.current?.stop(); }}>
                                <Square size={14} className="mr-1" /> Stop talking
                            </Button>
                        )}
                        {(phase === "done" || phase === "error") && (
                            <Button size="sm" onClick={askAloud}><Mic size={14} className="mr-1" /> Ask another</Button>
                        )}
                    </div>
                    {voice.wakeWordConfigured() && (
                        <label className="flex items-start justify-between gap-3 pt-2 border-t border-line cursor-pointer">
                            <span className="min-w-0">
                                <span className="block text-small text-ink">Listen for “Hey FinTwin”</span>
                                <span className="block text-caption text-ink-3">Only while FinTwin is open. Listening happens on your device; nothing is sent until you say it.</span>
                            </span>
                            <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={wakeOn}
                                   onChange={(e) => toggleWake(e.target.checked)} />
                        </label>
                    )}
                    {wakeProblem && <p className={cx("text-caption text-ink-3")}>{wakeProblem}</p>}
                </section>
            )}
        </>,
        document.body,
    );
}
