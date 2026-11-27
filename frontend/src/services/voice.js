/*
 * "Hey FinTwin" in the browser and the Android app (WebView).
 *
 * - Wake word (services/wakeWord.js): Porcupine, on the device. Off until the user switches it on,
 *   and only while FinTwin is open and on screen; no audio leaves the device
 *   until "Hey FinTwin" is heard. Needs VITE_PICOVOICE_ACCESS_KEY at build
 *   time and the keyword + model files in public/voice/ (see README there).
 * - The question: recorded after the wake word (or a tap on the mic) until
 *   the user stops talking, then sent once for transcription.
 * - The answer: read aloud piece by piece, each piece voiced while the one
 *   before it plays.
 */
import API from "./api";
import { pieces } from "../utils/voiceText";

const ACCESS_KEY = import.meta.env.VITE_PICOVOICE_ACCESS_KEY || "";

export const canRecord = () =>
    typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder !== "undefined";

/** The wake word can only be offered when the build has a Porcupine key. */
export const wakeWordConfigured = () => !!ACCESS_KEY && canRecord();

// ── Recording the question ──────────────────────────────────────────────────

const TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

/**
 * Records until the user has spoken and then gone quiet, or for maxMs at
 * most. Resolves to a Blob, or null when nothing was said. stop() ends it early.
 */
export function recordQuestion({ maxMs = 12000, quietMs = 1300, waitMs = 6000, onLevel } = {}) {
    let stopNow = () => {};
    const done = (async () => {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        const type = TYPES.find((t) => window.MediaRecorder.isTypeSupported?.(t)) || "";
        const rec = new window.MediaRecorder(stream, type ? { mimeType: type } : undefined);
        const chunks = [];
        rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };

        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = Ctx ? new Ctx() : null;
        const analyser = ctx?.createAnalyser();
        if (ctx) ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = analyser ? new Float32Array(analyser.fftSize) : null;

        let spoke = false;
        const started = performance.now();
        let lastLoud = started;

        return await new Promise((resolve) => {
            let timer;
            const finish = () => {
                clearInterval(timer);
                if (rec.state !== "inactive") rec.stop();
            };
            stopNow = finish;
            rec.onstop = () => {
                stream.getTracks().forEach((t) => t.stop());
                ctx?.close().catch(() => {});
                const blob = new Blob(chunks, { type: (rec.mimeType || type || "audio/webm").split(";")[0] });
                resolve(spoke || !analyser ? blob : null);
            };
            rec.start(250);
            timer = setInterval(() => {
                const now = performance.now();
                if (analyser) {
                    analyser.getFloatTimeDomainData(buf);
                    let sum = 0;
                    for (const v of buf) sum += v * v;
                    const level = Math.sqrt(sum / buf.length);
                    onLevel?.(Math.min(1, level * 8));
                    if (level > 0.02) { spoke = true; lastLoud = now; }
                    if (!spoke && now - started > waitMs) return finish();
                    if (spoke && now - lastLoud > quietMs) return finish();
                }
                if (now - started > maxMs) finish();
            }, 100);
        });
    })();
    return { done, stop: () => stopNow() };
}

export async function transcribe(blob) {
    const form = new FormData();
    const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    form.append("audio", blob, `question.${ext}`);
    const { data } = await API.post("/voice/transcribe", form);
    return (data?.text || "").trim();
}

export async function ask(question) {
    const { data } = await API.post("/transactions/chat", { message: question, mode: "Voice" });
    return data?.reply || "";
}

// ── Speaking the answer ─────────────────────────────────────────────────────

const voiced = (text) => API.post("/voice/speak", { text }, { responseType: "blob" }).then((r) => r.data);

/**
 * Reads the answer aloud. Returns { done, stop }; done resolves when the last
 * piece has played (or speech failed, which is fine: the text is on screen).
 */
export function speak(text, { onStart } = {}) {
    const parts = pieces(text);
    let stopped = false;
    let audio = null;
    const urls = [];
    const done = (async () => {
        if (!parts.length) return;
        let next = voiced(parts[0]);
        for (let i = 0; i < parts.length && !stopped; i++) {
            const blob = await next;
            if (i + 1 < parts.length) next = voiced(parts[i + 1]);
            if (stopped) break;
            const url = URL.createObjectURL(blob);
            urls.push(url);
            audio = new Audio(url);
            if (i === 0) onStart?.();
            await new Promise((resolve) => {
                audio.onended = resolve;
                audio.onerror = resolve;
                audio.play().catch(resolve);
            });
        }
    })().catch(() => {}).finally(() => urls.forEach((u) => URL.revokeObjectURL(u)));
    return {
        done,
        stop: () => {
            stopped = true;
            if (audio) { audio.pause(); audio.onended?.(); }
        },
    };
}

/** A soft two-note chime: "I'm listening". */
export function chime() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        [660, 880].forEach((f, i) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.frequency.value = f;
            o.type = "sine";
            const t = ctx.currentTime + i * 0.12;
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.12, t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
            o.connect(g).connect(ctx.destination);
            o.start(t);
            o.stop(t + 0.3);
        });
        setTimeout(() => ctx.close().catch(() => {}), 800);
    } catch { /* no audio: the panel shows it's listening */ }
}
