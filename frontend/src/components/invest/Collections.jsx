import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import API from "../../services/api";
import { Button, cx } from "../ui";
import { percent } from "../../utils/money";
import FundPage from "./FundPage";

/*
 * Fund collections, like Groww's "Index funds" or "Tax saving" rows, but as
 * plain filters on AMFI's own categories. Each says what it's sorted by and
 * that it isn't a recommendation: FinTwin isn't a SEBI-registered adviser.
 */

export default function Collections() {
    const [list, setList] = useState([]);
    const [key, setKey] = useState("index");
    const [byKey, setByKey] = useState({});
    const [open, setOpen] = useState(null);       // { code, name }
    const shown = byKey[key];

    useEffect(() => {
        let alive = true;
        API.get("/discover/funds/collections").then((r) => { if (alive) setList(Array.isArray(r.data) ? r.data : []); }).catch(() => {});
        return () => { alive = false; };
    }, []);
    useEffect(() => {
        if (byKey[key]) return;
        let alive = true;
        API.get(`/discover/funds/collections/${key}`)
            .then((r) => { if (alive) setByKey((m) => ({ ...m, [key]: Array.isArray(r.data?.funds) ? r.data : { failed: true, funds: [] } })); })
            .catch(() => { if (alive) setByKey((m) => ({ ...m, [key]: { failed: true, funds: [] } })); });
        return () => { alive = false; };
    }, [key, byKey]);

    if (open) {
        return (
            <div className="max-w-2xl">
                <Button variant="ghost" size="sm" icon={ArrowLeft} className="-ml-2 mb-4" onClick={() => setOpen(null)}>{shown?.title || "Collections"}</Button>
                <FundPage code={open.code} name={open.name} />
            </div>
        );
    }

    return (
        <div className="max-w-2xl">
            <div role="tablist" aria-label="Collections" className="flex gap-2 mb-4 overflow-x-auto -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
                {list.map((c) => (
                    <button key={c.key} type="button" role="tab" aria-selected={key === c.key} onClick={() => setKey(c.key)}
                            className={cx("h-9 px-3.5 rounded-control border text-small font-medium whitespace-nowrap shrink-0",
                                key === c.key ? "border-accent bg-accent/10 text-ink" : "border-line text-ink-2 hover:text-ink")}>
                        {c.title}
                    </button>
                ))}
            </div>
            {!shown ? (
                <p className="text-small text-ink-3 px-1">Loading funds and their past returns… the first time takes a few seconds.</p>
            ) : shown.failed ? (
                <p className="text-small text-ink-3 px-1">This list is unavailable right now.</p>
            ) : (
                <>
                    <p className="text-small text-ink-3 px-1 mb-2">
                        {shown.funds.length} funds · sorted by {shown.sortedBy}. {shown.note}
                    </p>
                    <ul className="rounded-card bg-surface border border-line divide-y divide-line">
                        <li className="hidden sm:grid grid-cols-[1fr_64px_64px_64px] gap-3 px-4 py-2 text-caption text-ink-3">
                            <span>Fund</span><span className="text-right">1Y</span><span className="text-right">3Y / yr</span><span className="text-right">5Y / yr</span>
                        </li>
                        {shown.funds.map((f) => (
                            <li key={f.code}>
                                <button type="button" onClick={() => setOpen({ code: f.code, name: f.name })}
                                        className="w-full grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_64px_64px_64px] gap-3 items-center px-4 py-3 text-left hover:bg-surface-sunken/60">
                                    <span className="min-w-0">
                                        <span className="block text-body text-ink truncate">{f.name.replace(/ - Direct Plan.*$/i, "").replace(/ Direct.*$/i, "")}</span>
                                        <span className="block text-caption text-ink-3 truncate">{f.amc}</span>
                                    </span>
                                    {["1y", "3y", "5y"].map((k) => {
                                        const v = f.returns?.[k];
                                        return (
                                            <span key={k} className={cx("text-small num text-right", k !== "3y" && "hidden sm:block",
                                                v == null ? "text-ink-3" : v >= 0 ? "text-good" : "text-bad")}>
                                                {v == null ? "—" : percent(v, { plus: true })}
                                                {k === "3y" && <span className="sm:hidden block text-caption text-ink-3">3Y / yr</span>}
                                            </span>
                                        );
                                    })}
                                </button>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
}
