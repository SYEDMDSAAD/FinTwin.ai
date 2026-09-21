// node --test ops/email-worker/test
import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { sign, toBase64 } from "../src/worker.js";

// Same vector as InboundEmailServiceTest.workerAndBackendAgreeOnTheSignature
test("signature matches the backend's HMAC contract", async () => {
    const body = '{"recipient":"u-x@d","raw":""}';
    assert.equal(await sign("test-shared-secret", "1790000000", body),
        "02ca65938fc52cf5d7c7d8d5979cc5657e17f5d7e65a3ae9fb182843891287ff");
});

test("base64 survives binary and large messages", () => {
    const bytes = new Uint8Array(200_000).map((_, i) => i % 256);
    assert.deepEqual(Buffer.from(toBase64(bytes), "base64"), Buffer.from(bytes));
});

function fakeMessage(text, to = "u-abc@in.fintwin.app") {
    const bytes = new TextEncoder().encode(text);
    return {
        to, rawSize: bytes.length, rejected: null,
        raw: new Response(bytes).body,
        setReject(reason) { this.rejected = reason; },
    };
}

test("posts the signed email and treats 503 as redeliver", async () => {
    const calls = [];
    globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response(null, { status: 503 }); };
    const env = { FINTWIN_WEBHOOK_URL: "https://api.test/api/v1/inbound/email", INBOUND_EMAIL_SECRET: "s" };

    await assert.rejects(worker.email(fakeMessage("From: a@b\r\n\r\nhi"), env), /redelivery/);

    const { init } = calls[0];
    const payload = JSON.parse(init.body);
    assert.equal(payload.recipient, "u-abc@in.fintwin.app");
    assert.equal(Buffer.from(payload.raw, "base64").toString(), "From: a@b\r\n\r\nhi");
    assert.equal(init.headers["X-FinTwin-Signature"],
        await sign("s", init.headers["X-FinTwin-Timestamp"], init.body));
});

test("a 200 is done; nothing is thrown", async () => {
    globalThis.fetch = async () => new Response("{}", { status: 200 });
    await worker.email(fakeMessage("x"), { FINTWIN_WEBHOOK_URL: "u", INBOUND_EMAIL_SECRET: "s" });
});

test("oversized mail is rejected without calling the backend", async () => {
    let called = false;
    globalThis.fetch = async () => { called = true; return new Response(null, { status: 200 }); };
    const msg = fakeMessage("x");
    msg.rawSize = 6 * 1024 * 1024;
    await worker.email(msg, { FINTWIN_WEBHOOK_URL: "u", INBOUND_EMAIL_SECRET: "s" });
    assert.equal(called, false);
    assert.equal(msg.rejected, "Message too large");
});
