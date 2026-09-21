// Cloudflare Email Worker: relays bank alert emails sent to u-<token>@<domain>
// to the FinTwin backend, signed so the backend knows the call came from here.
//
// The backend does all the judging (DKIM, which user, what the alert says);
// this worker only moves bytes. Its reply status decides redelivery:
//   2xx  handled (imported or deliberately dropped)
//   503  retry later (the backend couldn't fetch a DKIM key)
//   401  our secret doesn't match the backend's — a deployment mistake

const MAX_BYTES = 5 * 1024 * 1024;   // matches InboundEmailService.MAX_RAW_BYTES

export default {
    async email(message, env) {
        if (message.rawSize > MAX_BYTES) {
            message.setReject("Message too large");
            return;
        }
        const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
        const body = JSON.stringify({ recipient: message.to, raw: toBase64(raw) });
        const timestamp = Math.floor(Date.now() / 1000).toString();

        const res = await fetch(env.FINTWIN_WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-FinTwin-Timestamp": timestamp,
                "X-FinTwin-Signature": await sign(env.INBOUND_EMAIL_SECRET, timestamp, body),
            },
            body,
        });

        if (res.status >= 500) {
            // Ask for redelivery. Cloudflare does not document whether a thrown
            // error is a temporary or permanent SMTP failure; if it proves
            // permanent the alert is lost, and the next statement import still
            // brings that transaction in.
            throw new Error(`FinTwin asked for redelivery (HTTP ${res.status})`);
        }
        if (res.status === 401) {
            throw new Error("FinTwin refused the webhook signature: INBOUND_EMAIL_SECRET differs between worker and backend");
        }
    },
};

/** Hex HMAC-SHA256 of "timestamp.body" — the backend recomputes exactly this. */
export async function sign(secret, timestamp, body) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${body}`));
    return [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function toBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}
