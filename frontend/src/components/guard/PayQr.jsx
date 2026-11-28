import { useEffect, useState } from "react";
import { upiAppLink } from "./format";

/**
 * A payment link as a QR code, for a computer: the user scans it with the UPI
 * app on their phone, which fills in the payee and amount. Drawn as SVG from
 * the code's grid (no HTML is injected), and only for a upi://pay link.
 */
export default function PayQr({ link, size = 220 }) {
    const [grid, setGrid] = useState(null);
    const valid = upiAppLink(link) !== null;

    useEffect(() => {
        let live = true;
        if (!valid) return undefined;
        import("qrcode").then(({ default: QRCode }) => {
            const { modules } = QRCode.create(link, { errorCorrectionLevel: "M" });
            if (live) setGrid({ link, n: modules.size, dark: modules.data });
        }).catch(() => {});
        return () => { live = false; };
    }, [link, valid]);

    if (!valid || grid?.link !== link) return null;        // never a code drawn for another payment
    const quiet = 2;                                   // the blank border scanners need
    const side = grid.n + quiet * 2;
    let d = "";
    for (let y = 0; y < grid.n; y += 1) {
        for (let x = 0; x < grid.n; x += 1) {
            if (grid.dark[y * grid.n + x]) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
        }
    }
    return (
        <svg role="img" aria-label="QR code for this payment" width={size} height={size}
             viewBox={`0 0 ${side} ${side}`} shapeRendering="crispEdges"
             style={{ display: "block", background: "#fff", borderRadius: 8 }}>
            <rect width={side} height={side} fill="#fff" />
            <path d={d} fill="#000" />
        </svg>
    );
}
