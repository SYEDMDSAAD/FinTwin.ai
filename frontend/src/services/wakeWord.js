/*
 * "Hey FinTwin", spotted on the device by sherpa-onnx keyword spotting
 * (Apache-2.0, no account or key) running as WebAssembly in a worker
 * (public/voice/kws/). Loaded only when the user switches the wake word on.
 * The microphone's audio goes to that worker and nowhere else; only a
 * "heard it" comes back, and then the question is recorded as usual.
 */

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
export const WORKER_PATH = `${BASE}voice/kws/kws-worker.js`;

// "Hey FinTwin" as the model's word pieces, with the spellings an accent
// produces: "Fin Twin", "Finn Twin". Boost and threshold were tuned on
// made-up clips (no false wakes on "Hey Siri", "fintech", "find the twins").
export const KEYWORDS = [
    "▁HE Y ▁F IN T W IN",
    "▁HE Y ▁F IN ▁T W IN",
    "▁HE Y ▁F IN N ▁T W IN",
].join("\n");

export const wakeWordSupported = () =>
    typeof window !== "undefined" && typeof window.Worker !== "undefined" && typeof window.WebAssembly !== "undefined"
    && !!navigator.mediaDevices?.getUserMedia && !!(window.AudioContext || window.webkitAudioContext);

/** Shrinks a mic buffer to 16 kHz by averaging (the model's rate). */
export function downsample(input, fromRate, toRate = 16000) {
    if (fromRate === toRate) return new Float32Array(input);
    const ratio = fromRate / toRate;
    const out = new Float32Array(Math.floor(input.length / ratio));
    for (let i = 0; i < out.length; i++) {
        const start = Math.floor(i * ratio);
        const end = Math.min(input.length, Math.floor((i + 1) * ratio));
        let sum = 0;
        for (let j = start; j < end; j++) sum += input[j];
        out[i] = sum / Math.max(1, end - start);
    }
    return out;
}

/**
 * Starts listening for "Hey FinTwin". Returns { pause, resume, release };
 * pause and release let go of the microphone.
 */
export async function startWakeWord(onWake, onError) {
    const worker = new Worker(WORKER_PATH);
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("The wake word took too long to load")), 45000);
        worker.onmessage = (e) => {
            const m = e.data || {};
            if (m.type === "ready") { clearTimeout(timer); resolve(); }
            else if (m.type === "error") { clearTimeout(timer); reject(new Error(m.message)); }
        };
        worker.onerror = (e) => { clearTimeout(timer); reject(new Error(e.message || "The wake word failed to load")); };
        worker.postMessage({ type: "init", keywords: KEYWORDS });
    }).catch((e) => { worker.terminate(); throw e; });

    worker.onmessage = (e) => { if (e.data?.type === "wake") onWake(); };
    worker.onerror = (e) => onError?.(e);

    let mic = null;
    const resume = async () => {
        if (mic) return;
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        const source = ctx.createMediaStreamSource(stream);
        const node = ctx.createScriptProcessor(4096, 1, 1);
        node.onaudioprocess = (ev) => {
            const samples = downsample(ev.inputBuffer.getChannelData(0), ctx.sampleRate);
            worker.postMessage({ type: "audio", samples }, [samples.buffer]);
        };
        source.connect(node);
        node.connect(ctx.destination);   // silent: the node writes nothing to its output
        worker.postMessage({ type: "reset" });
        mic = { stream, ctx, source, node };
    };
    const pause = async () => {
        if (!mic) return;
        const { stream, ctx, source, node } = mic;
        mic = null;
        node.onaudioprocess = null;
        source.disconnect();
        node.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        await ctx.close().catch(() => {});
    };
    await resume();
    return {
        pause,
        resume,
        release: async () => { await pause(); worker.terminate(); },
    };
}
