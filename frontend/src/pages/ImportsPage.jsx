import { useState, useRef } from "react";
import { Upload, FileText, Check } from "lucide-react";
import API from "../services/api";
import toast from "react-hot-toast";

const STEP_LABELS = ["Upload File", "Map Columns", "Preview & Import"];

function normalizeDate(str) {
  if (!str) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const m = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(str);
  return isNaN(d) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
  const rows = lines.slice(1).map(line => {
    const vals = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { vals.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    vals.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
    return obj;
  });
  return { headers, rows };
}

function getAmount(row, mapping, debitCreditMode) {
  if (debitCreditMode) {
    const credit = parseFloat(row[mapping.credit]) || 0;
    const debit  = parseFloat(row[mapping.debit])  || 0;
    return credit - debit; // positive = income, negative = expense
  }
  return parseFloat(row[mapping.amount]) || 0;
}

function StepIndicator({ step }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 28 }}>
      {STEP_LABELS.map((label, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", flex: i < STEP_LABELS.length - 1 ? 1 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
              background: i < step ? "#4ade80" : i === step ? "#a78bfa" : "rgba(255,255,255,0.06)",
              border: `2px solid ${i < step ? "#4ade80" : i === step ? "#a78bfa" : "rgba(255,255,255,0.1)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, color: i <= step ? "#fff" : "rgba(148,163,184,0.4)",
              transition: "all 0.3s",
            }}>
              {i < step ? <Check size={13} /> : i + 1}
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: i === step ? "#fff" : "rgba(148,163,184,0.4)", whiteSpace: "nowrap" }}>
              {label}
            </span>
          </div>
          {i < STEP_LABELS.length - 1 && (
            <div style={{ flex: 1, height: 1, background: i < step ? "#4ade80" : "rgba(255,255,255,0.06)", margin: "0 12px", transition: "background 0.3s" }} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function ImportsPage({ onImported }) {
  const [step, setStep] = useState(0);
  const [csvData, setCsvData] = useState(null);
  const [fileName, setFileName] = useState("");
  const [debitCreditMode, setDebitCreditMode] = useState(false);
  const [mapping, setMapping] = useState({ date: "", merchant: "", amount: "", category: "", debit: "", credit: "" });
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const fileRef = useRef();

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) { toast.error("Please select a .csv file"); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result);
      setCsvData(parsed);
      setStep(1);
    };
    reader.readAsText(file);
  };

  const canProceed = debitCreditMode
    ? (mapping.date && (mapping.debit || mapping.credit))
    : (mapping.date && mapping.amount);

  const buildPreview = () => {
    const rows = (csvData?.rows || []).slice(0, 10).map((row, i) => ({
      id: i,
      date: normalizeDate(row[mapping.date]),
      merchant: row[mapping.merchant] || row[Object.keys(row)[0]] || "Unknown",
      amount: getAmount(row, mapping, debitCreditMode),
      category: row[mapping.category] || "Others",
    }));
    setPreview(rows);
    setStep(2);
  };

  const doImport = async () => {
    const all = (csvData?.rows || []).map(row => ({
      date: normalizeDate(row[mapping.date]),
      merchant: row[mapping.merchant] || "Unknown",
      amount: getAmount(row, mapping, debitCreditMode),
      category: row[mapping.category] || "Others",
    })).filter(r => r.amount !== 0);

    setImporting(true);
    try {
      const res = await API.post("/transactions/batch", all);
      const count = res.data?.imported ?? all.length;
      toast.success(`Imported ${count} transactions!`);
      setImportDone(true);
      if (onImported) onImported();
    } catch (err) {
      toast.error("Import failed: " + (err?.response?.data?.message || "Check your column mapping."));
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStep(0);
    setCsvData(null);
    setFileName("");
    setDebitCreditMode(false);
    setMapping({ date: "", merchant: "", amount: "", category: "", debit: "", credit: "" });
    setPreview([]);
    setImportDone(false);
  };

  const headers = csvData?.headers || [];
  const CARD = { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18, padding: 24 };

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", maxWidth: 720 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Upload size={18} color="#a78bfa" />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.12em" }}>SYSTEM</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: 0 }}>Import Transactions</h2>
        </div>
      </div>

      <StepIndicator step={step} />

      {/* Step 0: Upload */}
      {step === 0 && (
        <div style={CARD}>
          <div style={{ position: "absolute", inset: "0 0 auto", height: 1, background: "linear-gradient(90deg,transparent,rgba(167,139,250,0.3),transparent)", borderRadius: 18 }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em", marginBottom: 14 }}>STEP 1 — UPLOAD CSV FILE</div>
          <p style={{ fontSize: 13, color: "rgba(148,163,184,0.6)", lineHeight: 1.6, marginBottom: 20 }}>
            Export your bank statement as a CSV file and upload it here. In the next step you'll map which columns contain the date, amount, and merchant.
          </p>

          <label
            htmlFor="csv-upload"
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              border: "2px dashed rgba(167,139,250,0.25)", borderRadius: 16, height: 160, cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(167,139,250,0.5)"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(167,139,250,0.25)"}
          >
            <FileText size={36} color="rgba(167,139,250,0.4)" style={{ marginBottom: 10 }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>Click to select a CSV file</span>
            <span style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>Supports SBI, HDFC, Zerodha, Groww and more</span>
          </label>
          <input ref={fileRef} id="csv-upload" type="file" accept=".csv" style={{ display: "none" }} onChange={handleFile} />

          <div style={{ marginTop: 20, padding: 16, background: "rgba(34,211,238,0.04)", border: "1px solid rgba(34,211,238,0.12)", borderRadius: 12, fontSize: 12, color: "rgba(148,163,184,0.6)" }}>
            💡 For bank statement screenshots (PDF or image), use <strong style={{ color: "#22d3ee" }}>OCR Uploads</strong> in the sidebar instead.
          </div>
        </div>
      )}

      {/* Step 1: Column mapping */}
      {step === 1 && csvData && (
        <div style={CARD}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em", marginBottom: 6 }}>STEP 2 — MAP COLUMNS</div>
          <div style={{ fontSize: 12, color: "rgba(148,163,184,0.5)", marginBottom: 16 }}>
            File: <strong style={{ color: "#a78bfa" }}>{fileName}</strong> · {csvData.rows.length} rows detected
          </div>

          {/* Bank format toggle */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.08em", marginBottom: 8 }}>AMOUNT FORMAT</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setDebitCreditMode(false)}
                style={{
                  flex: 1, padding: "10px 14px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                  fontSize: 12, fontWeight: 600, transition: "all 0.2s", textAlign: "left",
                  background: !debitCreditMode ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${!debitCreditMode ? "rgba(167,139,250,0.5)" : "rgba(255,255,255,0.08)"}`,
                  color: !debitCreditMode ? "#a78bfa" : "rgba(148,163,184,0.5)",
                }}
              >
                Single Amount Column
                <div style={{ fontSize: 10, fontWeight: 400, marginTop: 3, color: !debitCreditMode ? "rgba(167,139,250,0.7)" : "rgba(148,163,184,0.35)" }}>
                  Zerodha, Groww — one column with +/− values
                </div>
              </button>
              <button
                onClick={() => setDebitCreditMode(true)}
                style={{
                  flex: 1, padding: "10px 14px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                  fontSize: 12, fontWeight: 600, transition: "all 0.2s", textAlign: "left",
                  background: debitCreditMode ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${debitCreditMode ? "rgba(74,222,128,0.4)" : "rgba(255,255,255,0.08)"}`,
                  color: debitCreditMode ? "#4ade80" : "rgba(148,163,184,0.5)",
                }}
              >
                Separate Debit + Credit
                <div style={{ fontSize: 10, fontWeight: 400, marginTop: 3, color: debitCreditMode ? "rgba(74,222,128,0.7)" : "rgba(148,163,184,0.35)" }}>
                  SBI, HDFC — separate columns for each
                </div>
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
            {/* Date — always shown */}
            <div>
              <label style={lbl}>Date Column *</label>
              <select style={inp} value={mapping.date} onChange={e => setMapping(m => ({ ...m, date: e.target.value }))}>
                <option value="">-- Which column has the date? --</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            {/* Merchant — always shown */}
            <div>
              <label style={lbl}>Merchant / Description Column</label>
              <select style={inp} value={mapping.merchant} onChange={e => setMapping(m => ({ ...m, merchant: e.target.value }))}>
                <option value="">-- Payee or description column --</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            {debitCreditMode ? (
              <>
                <div>
                  <label style={lbl}>Debit Column <span style={{ color: "#f87171", fontWeight: 400 }}>(withdrawals / expenses)</span></label>
                  <select style={inp} value={mapping.debit} onChange={e => setMapping(m => ({ ...m, debit: e.target.value }))}>
                    <option value="">-- Which column has debits? --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Credit Column <span style={{ color: "#4ade80", fontWeight: 400 }}>(deposits / income)</span></label>
                  <select style={inp} value={mapping.credit} onChange={e => setMapping(m => ({ ...m, credit: e.target.value }))}>
                    <option value="">-- Which column has credits? --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </>
            ) : (
              <div>
                <label style={lbl}>Amount Column *</label>
                <select style={inp} value={mapping.amount} onChange={e => setMapping(m => ({ ...m, amount: e.target.value }))}>
                  <option value="">-- Which column has the amount? --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            )}

            {/* Category — always shown */}
            <div>
              <label style={lbl}>Category Column</label>
              <select style={inp} value={mapping.category} onChange={e => setMapping(m => ({ ...m, category: e.target.value }))}>
                <option value="">-- Category column (optional) --</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>

          {/* Sample row preview */}
          {csvData.rows.length > 0 && (
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 14, marginBottom: 16, overflowX: "auto" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em", marginBottom: 8 }}>SAMPLE ROW (FIRST ROW)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {headers.map(h => (
                  <div key={h} style={{ minWidth: 120 }}>
                    <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 2, fontWeight: 700 }}>{h}</div>
                    <div style={{ fontSize: 12, color: "#fff", background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "4px 8px" }}>{csvData.rows[0][h] || "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {debitCreditMode && (
            <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(74,222,128,0.04)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 10, fontSize: 12, color: "rgba(148,163,184,0.6)" }}>
              Debit values → <strong style={{ color: "#f87171" }}>expense (−)</strong> &nbsp;·&nbsp; Credit values → <strong style={{ color: "#4ade80" }}>income (+)</strong>. Rows where both are empty or zero are skipped.
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setStep(0)} style={{ flex: 0, padding: "10px 18px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "none", color: "rgba(148,163,184,0.6)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
            <button
              disabled={!canProceed}
              onClick={buildPreview}
              style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: "none", background: canProceed ? "linear-gradient(135deg,#a78bfa,#7c3aed)" : "rgba(255,255,255,0.05)", color: canProceed ? "#fff" : "rgba(148,163,184,0.4)", fontSize: 13, fontWeight: 700, cursor: canProceed ? "pointer" : "default", fontFamily: "inherit", transition: "all 0.2s" }}
            >
              Preview → ({csvData.rows.length} rows)
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Preview & import */}
      {step === 2 && (
        <div style={CARD}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em", marginBottom: 6 }}>STEP 3 — PREVIEW & IMPORT</div>
          <div style={{ fontSize: 12, color: "rgba(148,163,184,0.5)", marginBottom: 16 }}>
            Showing first 10 of {csvData.rows.length} rows. Review before importing.
          </div>

          <div style={{ overflowX: "auto", marginBottom: 20 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Date","Merchant","Amount","Category"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 10, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <td style={{ padding: "9px 12px", fontSize: 12, color: "rgba(148,163,184,0.6)" }}>{row.date}</td>
                    <td style={{ padding: "9px 12px", fontSize: 13, color: "#fff" }}>{row.merchant}</td>
                    <td style={{ padding: "9px 12px", fontSize: 13, fontWeight: 700, color: row.amount >= 0 ? "#4ade80" : "#f87171" }}>
                      {row.amount >= 0 ? "+" : ""}₹{Math.abs(row.amount).toLocaleString("en-IN")}
                    </td>
                    <td style={{ padding: "9px 12px" }}>
                      <span style={{ fontSize: 11, color: "#a78bfa", background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 6, padding: "2px 8px" }}>
                        {row.category}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {importDone ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#4ade80", marginBottom: 4 }}>Import Complete!</div>
              <div style={{ fontSize: 13, color: "rgba(148,163,184,0.6)", marginBottom: 20 }}>{csvData.rows.length} transactions imported.</div>
              <button onClick={reset} style={{ padding: "10px 20px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "none", color: "rgba(148,163,184,0.6)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Import Another File</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(1)} style={{ flex: 0, padding: "10px 18px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "none", color: "rgba(148,163,184,0.6)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
              <button
                onClick={doImport}
                disabled={importing}
                style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#4ade80,#16a34a)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                {importing ? "Importing..." : `Import All ${csvData.rows.length} Transactions`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const lbl = { display: "block", fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.08em", marginBottom: 6 };
const inp = { width: "100%", padding: "9px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", appearance: "none" };
