/*
 * "Hey FinTwin" spotted on the device by Picovoice Porcupine (WASM, in a
 * worker). Loaded only when the user switches the wake word on. The keyword
 * and model files live in public/voice/ (see the README there).
 */

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
export const KEYWORD_PATH = `${BASE}voice/hey-fintwin.ppn`;
export const MODEL_PATH = `${BASE}voice/porcupine_params.pv`;
const ACCESS_KEY = import.meta.env.VITE_PICOVOICE_ACCESS_KEY || "";

/**
 * Starts listening for "Hey FinTwin". Returns { pause, resume, release };
 * pause/release let go of the microphone.
 */
export async function startWakeWord(onWake, onError) {
    const [{ PorcupineWorker }, { WebVoiceProcessor }] = await Promise.all([
        import("@picovoice/porcupine-web"),
        import("@picovoice/web-voice-processor"),
    ]);
    const worker = await PorcupineWorker.create(
        ACCESS_KEY,
        [{ label: "Hey FinTwin", publicPath: KEYWORD_PATH, sensitivity: 0.6, forceWrite: true, version: 1 }],
        () => onWake(),
        { publicPath: MODEL_PATH, forceWrite: true, version: 1 },
        { processErrorCallback: (e) => onError?.(e) },
    );
    let on = false;
    const resume = async () => { if (!on) { on = true; await WebVoiceProcessor.subscribe(worker); } };
    const pause = async () => { if (on) { on = false; await WebVoiceProcessor.unsubscribe(worker); } };
    await resume();
    return {
        pause,
        resume,
        release: async () => {
            await pause();
            await worker.release();
            worker.terminate();
        },
    };
}

