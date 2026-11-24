import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import QRCode from "qrcode";

// A UPI code drawn light-on-dark, the way Google Pay shows it in dark mode
async function darkModeCode(text) {
    const m = QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
    const scale = 6, quiet = 4, side = (m.size + quiet * 2) * scale;
    const px = new Uint8ClampedArray(side * side * 4);
    for (let y = 0; y < side; y += 1) for (let x = 0; x < side; x += 1) {
        const mx = Math.floor(x / scale) - quiet, my = Math.floor(y / scale) - quiet;
        const dark = mx >= 0 && my >= 0 && mx < m.size && my < m.size && m.get(my, mx);
        const v = dark ? 235 : 30;                      // modules light, background dark
        const i = (y * side + x) * 4;
        px[i] = px[i + 1] = px[i + 2] = v;
        px[i + 3] = 255;
    }
    return { px, side };
}

describe("QR decoding the scanner relies on", () => {
    it("reads a dark-mode code with attemptBoth, the mode the live scanner uses", async () => {
        const link = "upi://pay?pa=friend@okaxis&pn=Friend";
        const { px, side } = await darkModeCode(link);
        expect(jsQR(px, side, side, { inversionAttempts: "dontInvert" })).toBeNull();
        expect(jsQR(px, side, side, { inversionAttempts: "attemptBoth" })?.data).toBe(link);
    });
});
