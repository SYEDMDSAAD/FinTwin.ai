import { useEffect, useState } from "react";
import { MessageSquareText, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { Card, Button } from "./ui";
import { storedUserIsDemo } from "../utils/demoGuard";
import {
    FIRST_SYNC_DAYS, lastSync, requestSmsPermission, smsAvailable, smsPermission, syncSms,
} from "../services/smsSync";
import { SMS_TEST_BUILD } from "../services/smsSamples";

/* Android app only: turn bank SMS into transactions. */

function summary(r) {
    if (!r) return null;
    if (r.imported === 0 && r.read === 0) return "No new bank messages.";
    const parts = [`${r.imported} added`];
    const had = r.duplicates + r.onRecord;
    if (had) parts.push(`${had} already on record`);
    const skipped = (r.notTransaction || 0) + (r.notBank || 0);
    if (skipped) parts.push(`${skipped} skipped`);
    let text = parts.join(", ") + ".";
    if (r.unknownSenders?.length) text += ` Unrecognised senders: ${r.unknownSenders.join(", ")}.`;
    return text;
}

function when(ms) {
    if (!ms) return null;
    return new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export default function SmsSyncCard({ onImported }) {
    const [permission, setPermission] = useState(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [checkedAt, setCheckedAt] = useState(lastSync());
    const demo = storedUserIsDemo();

    useEffect(() => {
        if (smsAvailable()) smsPermission().then(setPermission).catch(() => setPermission("prompt"));
    }, []);

    if (!smsAvailable()) return null;

    const run = async (opts) => {
        setBusy(true);
        try {
            const r = await syncSms(opts);
            if (r) {
                setResult(r);
                setCheckedAt(lastSync());
                if (r.imported > 0) onImported?.(r);
            }
        } catch {
            toast.error("Couldn't read your messages. Try again.");
        } finally {
            setBusy(false);
        }
    };

    const turnOn = async () => {
        const p = await requestSmsPermission().catch(() => "denied");
        setPermission(p);
        if (p === "granted") run();
    };

    const on = permission === "granted";

    return (
        <Card className="mb-4">
            <div className="flex items-start gap-3">
                <div className="shrink-0 rounded-control bg-accent-soft p-2 text-accent">
                    <MessageSquareText size={20} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                    <h2 className="text-heading text-ink">Bank SMS</h2>
                    <p className="mt-1 text-small text-ink-2">
                        {on
                            ? "FinTwin reads your bank's transaction messages and adds them here, each time you open the app."
                            : `Let FinTwin read your bank's transaction messages and add them automatically, starting with the last ${FIRST_SYNC_DAYS} days.`}
                    </p>
                    <p className="mt-1 text-caption text-ink-3">
                        Only messages from banks are read. OTPs and personal messages are never sent anywhere.
                    </p>

                    {demo ? (
                        <p className="mt-3 text-small text-ink-3">Not available in the demo. Sign up to use your own messages.</p>
                    ) : on ? (
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => run()} disabled={busy}>
                                {busy ? "Checking…" : "Check now"}
                            </Button>
                            <span className="text-caption text-ink-3" role="status">
                                {busy ? "Reading messages…" : summary(result) || (checkedAt ? `Last checked ${when(checkedAt)}` : "")}
                            </span>
                        </div>
                    ) : permission === "denied" ? (
                        <p className="mt-3 text-small text-ink-2">
                            SMS access is off. To turn it on, open Android Settings → Apps → FinTwin → Permissions → SMS.
                        </p>
                    ) : (
                        <Button className="mt-3" size="sm" onClick={turnOn} disabled={permission === null}>
                            Allow and import
                        </Button>
                    )}

                    {SMS_TEST_BUILD && !demo && (
                        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
                            <Button variant="secondary" size="sm" onClick={() => run({ samples: true })} disabled={busy}>
                                Send test messages
                            </Button>
                            {!on && <span className="text-caption text-ink-3" role="status">{busy ? "Sending…" : summary(result)}</span>}
                        </div>
                    )}
                </div>
            </div>
        </Card>
    );
}
