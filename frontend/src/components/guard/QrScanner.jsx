import { useEffect, useRef, useState } from "react";
import { Camera, ImageUp, ClipboardPaste, X } from "lucide-react";

/* Reads a UPI QR code three ways: the camera, a photo, or a pasted link.
   Uses the browser's own QR detector where there is one (Chrome on Android)
   and jsQR, loaded only when needed, everywhere else (Safari on iPhone).
   Nothing here decides anything: the code goes to the server as scanned. */

const UPI = /^upi:\/\//i;

async function makeDecoder({ thorough = false } = {}) {
    if ("BarcodeDetector" in window) {
        try {
            const formats = await window.BarcodeDetector.getSupportedFormats?.();
            if (!formats || formats.includes("qr_code")) {
                const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
                return async (source) => (await detector.detect(source))[0]?.rawValue || null;
            }
        } catch {
            /* fall through to jsQR */
        }
    }
    const { default: jsQR } = await import("jsqr");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    return async (source) => {
        const w = source.videoWidth || source.naturalWidth || source.width;
        const h = source.videoHeight || source.naturalHeight || source.height;
        if (!w || !h || !ctx) return null;
        const scale = Math.min(1, (thorough ? 1400 : 800) / Math.max(w, h));
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(img.data, img.width, img.height, {
            inversionAttempts: thorough ? "attemptBoth" : "dontInvert",
        });
        return found?.data || null;
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
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" } }, audio: false,
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
        video.srcObject = stream;
        await video.play().catch(() => {});
        setScanning(true);

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
            {error && <div className="sg-error" role="alert">{error}</div>}
            <div className="sg-row">
                {scanning ? (
                    <button type="button" className="sg-btn sg-btn-quiet" onClick={() => stopRef.current?.()}>
                        <X size={16} /> Stop camera
                    </button>
                ) : (
                    <button type="button" className="sg-btn sg-btn-primary" onClick={startCamera} disabled={disabled}>
                        <Camera size={16} /> Scan a UPI QR
                    </button>
                )}
                <button type="button" className="sg-btn" onClick={() => fileRef.current?.click()} disabled={disabled}>
                    <ImageUp size={16} /> Upload a photo
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
