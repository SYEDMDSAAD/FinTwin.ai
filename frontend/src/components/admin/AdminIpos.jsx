import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import API from "../../services/api";

// The IPO catalog users see on Discover. Maintained by hand on purpose: NSE's
// site data is unofficial and its terms restrict automated collection. Status
// (upcoming / open / closed / listed) follows from the dates you enter.

const EMPTY = {
    name: "", symbol: "", category: "Mainboard", priceBandLow: "", priceBandHigh: "",
    issuePrice: "", lotSize: "", openDate: "", closeDate: "", allotmentDate: "", listingDate: "", notes: "",
};

const STATUS_COLOR = { OPEN: "#4ade80", UPCOMING: "#22d3ee", CLOSED: "#fbbf24", LISTED: "#a78bfa" };

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

export default function AdminIpos() {
    const [ipos, setIpos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState(null);       // null = closed; {id?, ...fields}
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        return API.get("/admin/ipos")
            .then(r => setIpos(Array.isArray(r.data) ? r.data : []))
            .catch(() => toast.error("Couldn't load IPOs"))
            .finally(() => setLoading(false));
    }, []);
    useEffect(() => { load(); }, [load]);

    const edit = (ipo) => setForm({
        id: ipo.id,
        ...Object.fromEntries(Object.keys(EMPTY).map(k => [k, ipo[k] ?? ""])),
    });

    const save = async () => {
        setSaving(true);
        const body = {
            name: form.name, symbol: form.symbol || null, category: form.category,
            priceBandLow: num(form.priceBandLow), priceBandHigh: num(form.priceBandHigh),
            issuePrice: num(form.issuePrice), lotSize: num(form.lotSize),
            openDate: form.openDate || null, closeDate: form.closeDate || null,
            allotmentDate: form.allotmentDate || null, listingDate: form.listingDate || null,
            notes: form.notes || null,
        };
        try {
            if (form.id) await API.put(`/admin/ipos/${form.id}`, body);
            else await API.post("/admin/ipos", body);
            toast.success(form.id ? "IPO updated" : "IPO added");
            setForm(null);
            load();
        } catch (e) {
            toast.error(e?.response?.data?.error || "Couldn't save the IPO");
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id) => {
        try {
            await API.delete(`/admin/ipos/${id}`);
            toast.success("IPO removed");
            setConfirmDelete(null);
            load();
        } catch {
            toast.error("Couldn't remove the IPO");
        }
    };

    const input = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
    const lbl = { display: "block", fontSize: 11, color: "var(--text-secondary)" };
    const f = (k, label, type = "text", extra = {}) => (
        <label style={lbl}>{label}
            <input type={type} style={{ ...input, marginTop: 3 }} value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} {...extra} />
        </label>
    );
    const btn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border-card)", background: "var(--bg-subtle)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>IPO catalog</h2>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
                        What users see under Discover → IPOs. Status follows from the dates; add the NSE symbol once it lists to show the live price.
                    </p>
                </div>
                {!form && <button type="button" style={btn} onClick={() => setForm({ ...EMPTY })}><Plus size={14} /> Add IPO</button>}
            </div>

            {form && (
                <form onSubmit={e => { e.preventDefault(); save(); }}
                      style={{ background: "var(--bg-card)", border: "1px solid var(--border-card)", borderRadius: 12, padding: 16, marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12 }}>
                    {f("name", "Company name *", "text", { required: true })}
                    {f("symbol", "NSE symbol (after listing)")}
                    <label style={lbl}>Category
                        <select style={{ ...input, marginTop: 3 }} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                            <option>Mainboard</option><option>SME</option>
                        </select>
                    </label>
                    {f("priceBandLow", "Price band low (₹)", "number", { min: 0, step: "0.01" })}
                    {f("priceBandHigh", "Price band high (₹)", "number", { min: 0, step: "0.01" })}
                    {f("issuePrice", "Final issue price (₹)", "number", { min: 0, step: "0.01" })}
                    {f("lotSize", "Lot size (shares)", "number", { min: 1 })}
                    {f("openDate", "Opens", "date")}
                    {f("closeDate", "Closes", "date")}
                    {f("allotmentDate", "Allotment", "date")}
                    {f("listingDate", "Listing", "date")}
                    <label style={{ ...lbl, gridColumn: "1 / -1" }}>Notes
                        <input style={{ ...input, marginTop: 3 }} value={form.notes} maxLength={1000} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
                    </label>
                    <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
                        <button type="submit" disabled={saving || !form.name.trim()} style={{ ...btn, background: "linear-gradient(135deg,#a78bfa,#7c3aed)", color: "#fff", border: "none" }}>
                            {saving ? "Saving…" : form.id ? "Save changes" : "Add IPO"}
                        </button>
                        <button type="button" style={btn} onClick={() => setForm(null)}>Cancel</button>
                    </div>
                </form>
            )}

            {loading ? (
                <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Loading…</p>
            ) : ipos.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>No IPOs yet. Add the first one — users see it under Discover straight away.</p>
            ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                        <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 11 }}>
                            <th style={{ padding: 8 }}>Company</th><th style={{ padding: 8 }}>Status</th>
                            <th style={{ padding: 8 }}>Price</th><th style={{ padding: 8 }}>Lot</th>
                            <th style={{ padding: 8 }}>Dates</th><th style={{ padding: 8 }} />
                        </tr>
                    </thead>
                    <tbody>
                        {ipos.map(ipo => (
                            <tr key={ipo.id} style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}>
                                <td style={{ padding: 8 }}>
                                    <div style={{ fontWeight: 600 }}>{ipo.name}</div>
                                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{ipo.category}{ipo.symbol ? ` · ${ipo.symbol}` : ""}</div>
                                </td>
                                <td style={{ padding: 8 }}><span style={{ color: STATUS_COLOR[ipo.status], fontWeight: 700, fontSize: 11 }}>{ipo.status}</span></td>
                                <td style={{ padding: 8 }}>{ipo.issuePrice ?? (ipo.priceBandLow ? `${ipo.priceBandLow}–${ipo.priceBandHigh}` : "—")}</td>
                                <td style={{ padding: 8 }}>{ipo.lotSize ?? "—"}</td>
                                <td style={{ padding: 8, fontSize: 11, color: "var(--text-secondary)" }}>
                                    {ipo.openDate || "?"} → {ipo.closeDate || "?"}{ipo.listingDate ? ` · lists ${ipo.listingDate}` : ""}
                                </td>
                                <td style={{ padding: 8, whiteSpace: "nowrap", textAlign: "right" }}>
                                    {confirmDelete === ipo.id ? (
                                        <>
                                            <span style={{ fontSize: 12, color: "var(--text-secondary)", marginRight: 6 }}>Remove?</span>
                                            <button type="button" style={{ ...btn, color: "#f87171" }} onClick={() => remove(ipo.id)}>Yes</button>{" "}
                                            <button type="button" style={btn} onClick={() => setConfirmDelete(null)}>No</button>
                                        </>
                                    ) : (
                                        <>
                                            <button type="button" aria-label={`Edit ${ipo.name}`} style={btn} onClick={() => edit(ipo)}><Pencil size={13} /></button>{" "}
                                            <button type="button" aria-label={`Remove ${ipo.name}`} style={btn} onClick={() => setConfirmDelete(ipo.id)}><Trash2 size={13} /></button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
