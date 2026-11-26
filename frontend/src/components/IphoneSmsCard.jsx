import { useState } from "react";
import { Smartphone, Copy, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import toast from "react-hot-toast";
import API from "../services/api";
import { API_ORIGIN } from "../services/apiOrigin";
import { Card, Button } from "./ui";
import { storedUserIsDemo } from "../utils/demoGuard";
import { smsAvailable } from "../services/smsSync";

/* iPhone: iOS doesn't let apps read SMS, but a Shortcuts automation can pass
   each bank message on to FinTwin as it arrives. This card gives the user
   their personal import key and the steps. The key can only add bank alerts
   to their account; making a new one retires the old. */

export function shortcutEndpoint(origin = API_ORIGIN || window.location.origin) {
    return `${origin}/api/v1/sms/shortcut`;
}

async function copy(text, what) {
    try {
        await navigator.clipboard.writeText(text);
        toast.success(`${what} copied`);
    } catch {
        toast.error("Couldn't copy. Select it and copy it yourself.");
    }
}

export default function IphoneSmsCard() {
    const [open, setOpen] = useState(false);
    const [key, setKey] = useState(null);
    const [busy, setBusy] = useState(false);

    if (smsAvailable()) return null;          // Android reads SMS itself
    const demo = storedUserIsDemo();
    const endpoint = shortcutEndpoint();

    const load = async (rotate = false) => {
        setBusy(true);
        try {
            const { data } = rotate ? await API.post("/sms/shortcut-key/rotate") : await API.get("/sms/shortcut-key");
            setKey(data.key);
            if (rotate) toast.success("New key made. Put it in your Shortcut; the old one no longer works.");
        } catch {
            toast.error("Couldn't get your key. Try again.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card className="mb-4">
            <div className="flex items-start gap-3">
                <div className="shrink-0 rounded-control bg-accent-soft p-2 text-accent">
                    <Smartphone size={20} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                    <h2 className="text-heading text-ink">Bank SMS on iPhone</h2>
                    <p className="mt-1 text-small text-ink-2">
                        A Shortcuts automation sends each bank message to FinTwin as it arrives. You choose which
                        messages: only ones that say "debited" or "credited".
                    </p>
                    <p className="mt-1 text-caption text-ink-3">
                        OTPs, balances and payment requests are ignored, and the message text is never stored.
                    </p>

                    {demo ? (
                        <p className="mt-3 text-small text-ink-3">Not available in the demo. Sign up to use your own messages.</p>
                    ) : (
                        <>
                            <button
                                type="button"
                                className="mt-2 inline-flex items-center gap-1 text-small font-semibold text-accent"
                                onClick={() => setOpen(!open)}
                                aria-expanded={open}
                            >
                                {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                {open ? "Hide the steps" : "Set it up (about 3 minutes)"}
                            </button>

                            {open && (
                                <ol className="mt-3 list-decimal space-y-2 pl-5 text-small text-ink-2">
                                    <li>Open the <b>Shortcuts</b> app → <b>Automation</b> → <b>+</b> → <b>Message</b>.</li>
                                    <li>
                                        Set <b>Message Contains</b> to <code>debited</code>, and choose <b>Run Immediately</b>.
                                        Tap <b>Next</b>, then <b>New Blank Automation</b>.
                                    </li>
                                    <li>
                                        Add the action <b>Get Contents of URL</b> and paste this as the URL:
                                        <div className="mt-1 flex items-center gap-2">
                                            <code className="min-w-0 flex-1 break-all rounded-control bg-surface-sunken px-2 py-1 text-caption text-ink">{endpoint}</code>
                                            <Button variant="ghost" size="sm" icon={Copy} onClick={() => copy(endpoint, "Link")}>Copy</Button>
                                        </div>
                                    </li>
                                    <li>
                                        Tap <b>Show More</b>: Method <b>POST</b>. Under <b>Headers</b> add <code>X-FinTwin-Key</code> with
                                        your key as the value:
                                        <div className="mt-1 flex flex-wrap items-center gap-2">
                                            {key ? (
                                                <>
                                                    <code className="min-w-0 flex-1 break-all rounded-control bg-surface-sunken px-2 py-1 text-caption text-ink">{key}</code>
                                                    <Button variant="ghost" size="sm" icon={Copy} onClick={() => copy(key, "Key")}>Copy</Button>
                                                </>
                                            ) : (
                                                <Button variant="secondary" size="sm" onClick={() => load(false)} disabled={busy}>
                                                    {busy ? "Getting it…" : "Show my key"}
                                                </Button>
                                            )}
                                        </div>
                                    </li>
                                    <li>
                                        Under <b>Request Body</b> choose <b>JSON</b> and add a text field <code>message</code>. For its value,
                                        tap the variable <b>Shortcut Input</b>, then tap it again and pick <b>Content</b>.
                                    </li>
                                    <li>Tap <b>Done</b>. Then make a second automation the same way for <code>credited</code>.</li>
                                </ol>
                            )}

                            {open && key && (
                                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                                    <span className="text-caption text-ink-3">
                                        Keep the key private. If it leaks, make a new one: this also changes your email-alert address.
                                    </span>
                                    <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => load(true)} disabled={busy}>
                                        New key
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </Card>
    );
}
