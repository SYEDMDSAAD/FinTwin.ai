import { useRef, useState } from "react";
import { FileUp, RefreshCw, X } from "lucide-react";
import API from "../services/api";
import { Button, cx } from "./ui";
import { longDate } from "../utils/money";

// Every holding at once from a Consolidated Account Statement: mutual funds
// from CAMS/KFintech, shares and demat funds from NSDL/CDSL. The statement's
// password opens the file once and is never kept; the investor's name, PAN
// and contact details are dropped before anything is saved.

const INPUT = "w-full h-10 rounded-control bg-surface-sunken border border-transparent px-3 text-small text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent";
const SOURCE = { CAMS: "CAMS", KFINTECH: "KFintech", NSDL: "NSDL", CDSL: "CDSL" };

export default function ImportCas({ onImported }) {
    const input = useRef(null);
    const [open, setOpen] = useState(false);
    const [file, setFile] = useState(null);
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState(null);   // { tone: "good" | "bad", text }

    const submit = async (e) => {
        e.preventDefault();
        if (!file || !password) return;
        setBusy(true);
        setNote(null);
        const body = new FormData();
        body.append("file", file);
        body.append("password", password);
        try {
            const { data } = await API.post("/portfolio/import-cas", body);
            setPassword("");
            setFile(null);
            const when = data.statementTo ? `, units as of ${longDate(data.statementTo)}` : "";
            setNote(data.added || data.updated
                ? { tone: "good", text: `${SOURCE[data.source] || "CAS"} statement: ${data.added} new, ${data.updated} updated${when}.` }
                : { tone: "good", text: "Nothing new in that statement." });
            onImported?.(data);
        } catch (err) {
            const detail = err?.response?.data;
            const text = detail?.code === "password_incorrect" ? "That password didn't open it. Try again."
                : detail?.error || "Couldn't read that statement. Try again.";
            setNote({ tone: "bad", text });
        } finally {
            setBusy(false);
        }
    };

    if (!open) {
        return (
            <Button size="sm" variant="secondary" icon={FileUp} onClick={() => setOpen(true)}>Import statement</Button>
        );
    }

    return (
        <form onSubmit={submit} aria-label="Import a CAS statement"
              className="basis-full mt-2 p-4 rounded-card bg-surface border border-line space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-body font-medium text-ink">Import a CAS statement</p>
                    <p className="text-small text-ink-3 mt-0.5">
                        All your mutual funds from a CAMS or KFintech CAS, or shares from an NSDL or CDSL CAS,
                        with every purchase and SIP. Ask for a free detailed CAS on the CAMS or KFintech website.
                    </p>
                </div>
                <button type="button" aria-label="Close" onClick={() => { setOpen(false); setNote(null); }}
                        className="shrink-0 p-1 text-ink-3 hover:text-ink"><X size={16} aria-hidden /></button>
            </div>
            <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" aria-label="CAS PDF"
                   onChange={(e) => { setFile(e.target.files?.[0] || null); e.target.value = ""; }} />
            <button type="button" onClick={() => input.current?.click()}
                    className="w-full h-10 px-3 rounded-control bg-surface-sunken text-left text-small truncate">
                {file ? <span className="text-ink">{file.name}</span> : <span className="text-ink-3">Choose the PDF…</span>}
            </button>
            <input type="password" className={INPUT} placeholder="Statement password" aria-label="Statement password"
                   value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
            <p className="text-caption text-ink-3">
                The password you set when you asked CAMS or KFintech for it, or your PAN in capitals for NSDL/CDSL.
                It's used once to open the file and never kept.
            </p>
            <Button type="submit" size="sm" disabled={!file || !password || busy} icon={busy ? RefreshCw : undefined}>
                {busy ? "Reading…" : "Import"}
            </Button>
            {note && <p role="status" className={cx("text-small", note.tone === "good" ? "text-good" : "text-bad")}>{note.text}</p>}
        </form>
    );
}
