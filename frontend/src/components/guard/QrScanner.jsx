import { useEffect, useRef, useState } from "react";
import { Camera, ImageUp, ClipboardPaste, X } from "lucide-react";

/* Reads a UPI QR code three ways: the camera, a photo, or a pasted link.
   Uses the browser's own QR detector where there is one (Chrome on Android)
   and jsQR, loaded only when needed, everywhere else (Safari on iPhone).
   Nothing here decides anything: the code goes to the server as scanned. */

const UPI = /^upi:\/\//i;

/** The browser's own QR detector, or null. On some Android phones it exists
    but never finds anything, so it is only ever a first try. */
async function nativeDetector() {
    if (!("BarcodeDetector" in window)) return null;
    try {
        const formats = await window.BarcodeDetector.getSupportedFormats?.();
        if (formats && !formats.includes("qr_code")) return null;
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        return async (source) => (await detector.detect(source))[0]?.rawValue || null;
    } catch {
        return null;
    }
}

/** jsQR, which works everywhere. Live: the middle of the picture, where the
    on-screen box is, at full detail. A photo: the whole picture. */
async function jsqrDecoder({ thorough }) {
    const { default: jsQR } = await import("jsqr");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    return async (source) => {
        const w = source.videoWidth || source.naturalWidth || source.width;
        const h = source.videoHeight || source.naturalHeight || source.height;
        if (!w || !h || !ctx) return null;
        let sx = 0, sy = 0, sw = w, sh = h;
        if (!thorough) {
            const side = Math.round(Math.min(w, h) * 0.85);   // the square on screen, a little past the box
            sx = Math.round((w - side) / 2);
            sy = Math.round((h - side) / 2);
            sw = sh = side;
        }
        const scale = Math.min(1, (thorough ? 1400 : 720) / Math.max(sw, sh));
        canvas.width = Math.round(sw * scale);
        canvas.height = Math.round(sh * scale);
        ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        // Both ways round: dark-mode codes (Google Pay's) are light on dark. jsQR's
        // "onlyInvert" crashes in 1.4, so never use it.
        const found = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
        return found?.data || null;
    };
}

async function makeDecoder({ thorough = false } = {}) {
    const native = await nativeDetector();
    const fallback = await jsqrDecoder({ thorough });
    return async (source) => {
        if (native) {
            const text = await native(source).catch(() => null);
            if (text) return text;
        }
        return fallback(source);
    };
}

export default function QrScanner({ onCode, disabled = false }) {
    const videoRef = useRef(null);
    const stopRef = useRef(null);
    const fileRef = useRef(null);
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState("");
    const [pasting, setPasting] = useState(false);
    const [pasted, setPasted] = useState("");

    // Never leave the camera on when the screen goes away
    useEffect(() => () => stopRef.current?.(), []);

    function found(text) {
        const code = String(text || "").trim();
        if (!UPI.test(code)) {
            setError("That QR code isn't a UPI payment code.");
            return false;
        }
        setError("");
        onCode(code);
        return true;
    }

    async function startCamera() {
        setError("");
        if (!navigator.mediaDevices?.getUserMedia) {
            setError("This browser can't open the camera. Upload a photo of the QR code, or paste its link.");
            return;
        }
        let stream;
        try {
            // A sharper picture than the default 640x480 makes a small code readable
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false,
            });
        } catch {
            setError("The camera is blocked. Allow it for this site, or upload a photo of the QR code instead.");
            return;
        }
        const video = videoRef.current;
        if (!video) {
            stream.getTracks().forEach((t) => t.stop());
            return;
        }
        // Keep refocusing where the phone allows it, so a code held close stays sharp
        try {
            const [track] = stream.getVideoTracks();
            if (track?.getCapabilities?.().focusMode?.includes("continuous")) {
                await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
            }
        } catch {
            /* not every camera can */
        }
        setScanning(true);
        video.srcObject = stream;
        await video.play().catch(() => {});

        let live = true;
        let timer;
        const stop = () => {
            live = false;
            clearTimeout(timer);
            stream.getTracks().forEach((t) => t.stop());
            if (videoRef.current) videoRef.current.srcObject = null;
            stopRef.current = null;
            setScanning(false);
        };
        stopRef.current = stop;

        const decode = await makeDecoder();
        let lastWrong = "";
        const tick = async () => {
            if (!live) return;
            if (video.readyState >= 2) {
                const text = await decode(video).catch(() => null);
                if (text && UPI.test(text.trim())) {
                    stop();
                    found(text);
                    return;
                }
                if (text && text !== lastWrong) {
                    lastWrong = text;
                    setError("That QR code isn't a UPI payment code. Try the shop's UPI QR.");
                }
            }
            timer = setTimeout(tick, 250);
        };
        tick();
    }

    async function fromPhoto(e) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setError("");
        try {
            const bitmap = await createImageBitmap(file);
            const decode = await makeDecoder({ thorough: true });
            const text = await decode(bitmap);
            bitmap.close?.();
            if (!text) {
                setError("No QR code found in that photo. Try a closer, sharper one.");
                return;
            }
            found(text);
        } catch {
            setError("That photo couldn't be read. Try another, or paste the link.");
        }
    }

    return (
        <div className="sg-stack">
            <div className="sg-frame" hidden={!scanning}>
                <video ref={videoRef} className="sg-video" playsInline muted aria-label="Camera view for scanning a QR code" />
            </div>
            {scanning && (
                <div className="sg-sub" role="status">
                    Looking for a UPI QR code. Fit it inside the box, about a hand's length away, and hold still.
                </div>
            )}
            {error && <div className="sg-error" role="alert">{error}</div>}
            <div className="sg-row">
                {scanning ? (
                    <button type="button" className="sg-btn sg-btn-quiet" onClick={() => stopRef.current?.()}>
                        <X size={16} /> Stop camera
                    </button>
                ) : (
                    <button type="button" className="sg-btn sg-btn-primary" onClick={startCamera} disabled={disabled}>
                        <Camera size={16} /> Scan QR
                    </button>
                )}
                <button type="button" className="sg-btn" onClick={() => fileRef.current?.click()} disabled={disabled}>
                    <ImageUp size={16} /> Upload photo
                </button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={fromPhoto} aria-label="QR code photo" />
                <button type="button" className="sg-btn sg-btn-quiet" onClick={() => setPasting((v) => !v)} disabled={disabled}>
                    <ClipboardPaste size={16} /> Paste a link
                </button>
            </div>
            {pasting && (
                <form
                    className="sg-row"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (found(pasted)) {
                            setPasted("");
                            setPasting(false);
                        }
                    }}
                >
                    <input
                        className="sg-input"
                        style={{ flex: "1 1 240px" }}
                        placeholder="upi://pay?pa=…"
                        value={pasted}
                        onChange={(e) => setPasted(e.target.value)}
                        aria-label="UPI payment link"
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <button type="submit" className="sg-btn" disabled={!pasted.trim()}>Use this link</button>
                </form>
            )}
        </div>
    );
}
