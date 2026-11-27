/*
 * "Hey FinTwin" in the browser and the Android app (WebView).
 *
 * - Wake word (services/wakeWord.js): sherpa-onnx keyword spotting, on the
 *   device. Off until the user switches it on, and only while FinTwin is open
 *   and on screen; no audio leaves the device until "Hey FinTwin" is heard.
 * - The question: recorded after the wake word (or a tap on the mic) until
 *   the user stops talking, then sent once for transcription.
 * - The answer: read aloud piece by piece, each piece voiced while the one
 *   before it plays.
 */
import API from "./api";
import { pieces } from "../utils/voiceText";

import { wakeWordSupported } from "./wakeWord";

export const canRecord = () =>
    typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder !== "undefined";

/** The wake word runs where workers, WebAssembly and the microphone are all available. */
export const wakeWordConfigured = () => canRecord() && wakeWordSupported();

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

// ── Speaking ────────────────────────────────────────────────────────────────

// As base64 JSON: the Android app's native HTTP layer turns binary bodies into text
const voiced = (text) => API.post("/voice/speak?encoding=base64", { text }).then((r) => toBlob(r.data));

export function toBlob(data) {
    if (!data?.audio) throw new Error("No audio in the answer");
    const bin = atob(data.audio);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: data.contentType || "audio/wav" });
}

/** Plays one clip; done resolves when it ends (or can't play). */
export function play(blob) {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    const done = new Promise((resolve) => {
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.play().catch(resolve);
    }).finally(() => URL.revokeObjectURL(url));
    return { done, stop: () => { audio.pause(); audio.onended?.(); } };
}

// Short phrases said often ("Yes, hi Saad…"), voiced once and kept for the visit
const phrases = new Map();

/** The phrase in FinTwin's voice, from memory after the first time; null if the voice is unavailable. */
export function phrase(text) {
    if (!phrases.has(text)) {
        phrases.set(text, voiced(text).catch(() => { phrases.delete(text); return null; }));
    }
    return phrases.get(text);
}

/**
 * Reads the answer aloud. Returns { done, stop }; done resolves when the last
 * piece has played (or speech failed).
 */
export function speak(text, { onStart } = {}) {
    const parts = pieces(text);
    let stopped = false;
    let current = null;
    const done = (async () => {
        if (!parts.length) return;
        let next = voiced(parts[0]);
        for (let i = 0; i < parts.length && !stopped; i++) {
            const blob = await next;
            if (i + 1 < parts.length) next = voiced(parts[i + 1]).catch(() => null);
            if (stopped || !blob) break;
            current = play(blob);
            if (i === 0) onStart?.();
            await current.done;
        }
    })().catch(() => {});
    return {
        done,
        stop: () => { stopped = true; current?.stop(); },
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
