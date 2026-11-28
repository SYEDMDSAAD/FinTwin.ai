import { describe, it, expect, vi, beforeEach } from "vitest";

const native = vi.hoisted(() => ({ platform: "android", permission: "granted", messages: [] }));
const post = vi.hoisted(() => vi.fn());

vi.mock("@capacitor/core", () => ({
    Capacitor: { isNativePlatform: () => native.platform !== "web", getPlatform: () => native.platform },
    registerPlugin: () => ({
        checkPermissions: async () => ({ sms: native.permission }),
        requestPermissions: async () => ({ sms: native.permission }),
        inbox: async ({ since }) => ({ messages: native.messages.filter((m) => m.receivedAt > since) }),
    }),
}));
vi.mock("./api", () => ({ default: { post } }));

import { syncSms, lastSync, FIRST_SYNC_DAYS } from "./smsSync";

const NOW = Date.UTC(2026, 10, 25);
const msg = (i) => ({ sender: "VM-HDFCBK", body: `Sent Rs.${i} From HDFC Bank`, receivedAt: NOW - 1000 * (1000 - i) });

describe("syncSms", () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem("token", "t");
        localStorage.setItem("user", JSON.stringify({ email: "Sample@Example.com", role: "USER" }));
        native.platform = "android";
        native.permission = "granted";
        native.messages = [];
        post.mockReset();
        post.mockImplementation(async (_url, { messages }) => ({ data: { imported: messages.length, duplicates: 0, onRecord: 0, notBank: 0, notTransaction: 0 } }));
    });

    it("sends new messages in batches and remembers the newest one", async () => {
        native.messages = Array.from({ length: 450 }, (_, i) => msg(i));
        const r = await syncSms({ now: NOW });
        expect(post).toHaveBeenCalledTimes(2);
        expect(post.mock.calls[0][0]).toBe("/sms/import");
        expect(post.mock.calls[0][1].messages).toHaveLength(400);
        expect(r.imported).toBe(450);
        expect(Number(localStorage.getItem("fintwin_sms_since:sample@example.com"))).toBe(msg(449).receivedAt);
        expect(lastSync()).toBe(NOW);

        post.mockClear();
        const again = await syncSms({ now: NOW + 1 });
        expect(post).not.toHaveBeenCalled();
        expect(again.read).toBe(0);
    });

    it("a first sync starts the configured number of days back", async () => {
        const old = { ...msg(0), receivedAt: NOW - (FIRST_SYNC_DAYS + 1) * 86_400_000 };
        native.messages = [old, msg(5)];
        const r = await syncSms({ now: NOW });
        expect(r.read).toBe(1);
    });

    it("does nothing without permission, in the demo, or off Android", async () => {
        native.messages = [msg(1)];
        native.permission = "prompt";
        expect(await syncSms({ now: NOW })).toBeNull();

        native.permission = "granted";
        localStorage.setItem("user", JSON.stringify({ email: "demo@fintwin.ai", role: "DEMO" }));
        expect(await syncSms({ now: NOW })).toBeNull();

        localStorage.setItem("user", JSON.stringify({ email: "a@b.c", role: "USER" }));
        native.platform = "web";
        expect(await syncSms({ now: NOW })).toBeNull();
        expect(post).not.toHaveBeenCalled();
    });

    it("keeps its place when a batch fails, so the next sync resumes there", async () => {
        native.messages = Array.from({ length: 450 }, (_, i) => msg(i));
        post.mockImplementationOnce(async () => ({ data: { imported: 400 } })).mockRejectedValueOnce(new Error("offline"));
        await expect(syncSms({ now: NOW })).rejects.toThrow("offline");
        expect(Number(localStorage.getItem("fintwin_sms_since:sample@example.com"))).toBe(msg(399).receivedAt);
    });
});
