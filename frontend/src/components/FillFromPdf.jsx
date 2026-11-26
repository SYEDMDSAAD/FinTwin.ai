import { useRef, useState } from "react";
import { FileUp, RefreshCw } from "lucide-react";
import API from "../services/api";
import { cx } from "./ui";

// The import agent: pick a policy or loan PDF and FinTwin fills the form from
// it. Nothing is saved until the user checks the form and taps save. A
// password-protected PDF asks for its password, which is sent once to open
// the file and never kept.

const INPUT = "w-full h-10 rounded-control bg-surface-sunken border border-transparent px-3 text-small text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent";

/**
 * @param kind     "policy" | "loan"
 * @param onFields (fields) — the fields the reader found; only those present are set
 */
export default function FillFromPdf({ kind, onFields, className }) {
    const input = useRef(null);
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [needsPassword, setNeedsPassword] = useState(false);
    const [password, setPassword] = useState("");
    const [note, setNote] = useState(null);   // { tone: "good" | "bad", text }

    const read = async (f, pw) => {
        setBusy(true);
        setNote(null);
        const body = new FormData();
        body.append("file", f);
        body.append("kind", kind);
        if (pw) body.append("password", pw);
        try {
            const { data } = await API.post("/documents/extract", body);
            const fields = data?.fields || {};
            const n = Object.keys(fields).length;
            setNeedsPassword(false);
            setPassword("");
            if (n === 0) {
                setNote({ tone: "bad", text: "Couldn't find the details in that PDF. Fill the form by hand." });
            } else {
                onFields(fields);
                setNote({ tone: "good", text: `Filled ${n} ${n === 1 ? "field" : "fields"} from the PDF. Check them before saving.` });
            }
        } catch (err) {
            const detail = err?.response?.data;
            const code = detail?.code;
            if (code === "password_required" || code === "password_incorrect") {
                setNeedsPassword(true);
                setNote(code === "password_incorrect" ? { tone: "bad", text: "That password didn't open it." } : null);
            } else {
                setNote({ tone: "bad", text: detail?.error || "Couldn't read that PDF. Fill the form by hand." });
            }
        } finally {
            setBusy(false);
        }
    };

    const onPick = (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        setFile(f);
        read(f);
    };

    return (
        <div className={cx("space-y-2", className)}>
            <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onPick}
                   aria-label={kind === "policy" ? "Policy PDF" : "Loan statement PDF"} />
            <button type="button" onClick={() => input.current?.click()} disabled={busy}
                    className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full bg-accent-soft text-accent text-small font-medium disabled:opacity-60">
                {busy ? <RefreshCw size={14} aria-hidden className="animate-spin" /> : <FileUp size={14} aria-hidden />}
                {busy ? "Reading…" : kind === "policy" ? "Fill from policy PDF" : "Fill from loan statement"}
            </button>
            {needsPassword && (
                <div className="flex gap-2">
                    <input type="password" className={INPUT} placeholder="PDF password" aria-label="PDF password"
                           value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
                    <button type="button" disabled={!password || busy} onClick={() => read(file, password)}
                            className="shrink-0 h-10 px-4 rounded-full bg-accent-strong text-white text-small font-medium disabled:opacity-50">
                        Open
                    </button>
                </div>
            )}
            {note && <p role="status" className={cx("text-small", note.tone === "good" ? "text-ink-3" : "text-bad")}>{note.text}</p>}
        </div>
    );
}
