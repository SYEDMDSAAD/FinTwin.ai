import { useState, useRef } from "react";
import { FileText, Check } from "lucide-react";
import API from "../services/api";
import toast from "react-hot-toast";
import { parseStatement, parseGrid, guessMapping, buildImportRows, summarize, guessAccountLabel } from "../services/statementParser";
import DataCoverage from "../components/DataCoverage";
import EmailAlertsSetup from "../components/EmailAlertsSetup";
import SmsSyncCard from "../components/SmsSyncCard";
import IphoneSmsCard from "../components/IphoneSmsCard";

const STEP_LABELS = ["Choose file", "Check columns", "Import"];

// Read in the browser vs. sent to the server, which has the PDF and Excel readers
const LOCAL_TYPES = /\.(csv|txt)$/i;
const SERVER_TYPES = /\.(pdf|xls|xlsx)$/i;

// Statements from UPI apps list payments that also leave a bank account
const UPI_APPS = /phone\s*pe|paytm|google\s*pay|gpay|bhim|cred\b/i;

const EMPTY_MAPPING = { date: "", merchant: "", amount: "", category: "", debit: "", credit: "", balance: "", direction: "" };

/* Three short segments with the current step named: quieter than numbered circles. */
function StepIndicator({ step }) {
  return (
    <div style={{ marginBottom: 12 }} aria-label={`Step ${step + 1} of ${STEP_LABELS.length}: ${STEP_LABELS[step]}`}>
      <div style={{ display: "flex", gap: 4 }} aria-hidden>
        {STEP_LABELS.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 99, background: i <= step ? "var(--accent)" : "var(--bg-input)", transition: "background 0.3s" }} />
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-dim)" }}>
        Step {step + 1} of {STEP_LABELS.length} · <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{STEP_LABELS[step]}</span>
      </div>
    </div>
  );
}

// compact: just the import wizard, for embedding in onboarding — no coverage
// panel, no alert-email setup, no page header.
export default function ImportsPage({ onImported, onViewTransactions, compact = false }) {
  const [step, setStep] = useState(0);
  const [csvData, setCsvData] = useState(null);
  const [fileName, setFileName] = useState("");
  const [accountType, setAccountType] = useState("BANK");
  // "HDFC ··1234": ties this statement to the account its alert emails come from
  const [account, setAccount] = useState("");
  const [coverageKey, setCoverageKey] = useState(0);
  const [debitCreditMode, setDebitCreditMode] = useState(false);
  const [flipSign, setFlipSign] = useState(false);
  const [mapping, setMapping] = useState(EMPTY_MAPPING);
  // The page's own guess and where the file came from — reported after an
  // import so formats that need fixing by hand show up for the team
  const [detected, setDetected] = useState(null);
  const [built, setBuilt] = useState({ rows: [], skipped: 0 });
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [reading, setReading] = useState(false);
  // A password-protected PDF waits here while the user types its password.
  // The password is sent once with the file and never stored.
  const [lockedFile, setLockedFile] = useState(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const fileRef = useRef();

  const startMapping = (parsed, name, source = null) => {
    if (parsed.rows.length === 0) {
      toast.error("No transactions found in this file");
      return;
    }
    const guess = guessMapping(parsed.headers);
    setFileName(name);
    setAccount(guessAccountLabel(parsed.preamble, name));
    setCsvData(parsed);
    setMapping({ ...EMPTY_MAPPING, ...guess.mapping });
    setDebitCreditMode(guess.debitCreditMode);
    setDetected({
      mapping: { ...EMPTY_MAPPING, ...guess.mapping, debitCreditMode: !!guess.debitCreditMode, flipSign: false },
      fileType: (name.split(".").pop() || "").toLowerCase(),
      format: source,
    });
    setStep(1);
  };

  const readOnServer = async (file, pw) => {
    const form = new FormData();
    form.append("file", file);
    if (pw) form.append("password", pw);
    setReading(true);
    try {
      const res = await API.post("/transactions/statement/extract", form);
      setLockedFile(null);
      setPassword("");
      setPasswordError("");
      startMapping(parseGrid(res.data?.grid), file.name, res.data?.format || null);
    } catch (err) {
      const code = err?.response?.data?.code;
      const message = err?.response?.data?.error || "This file could not be read.";
      if (code === "password_required" || code === "password_incorrect") {
        setLockedFile(file);
        setPasswordError(code === "password_incorrect" ? message : "");
      } else {
        setLockedFile(null);
        toast.error(message);
      }
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (SERVER_TYPES.test(file.name)) {
      readOnServer(file);
      return;
    }
    // HDFC and a few others export tab-delimited .txt; the parser sniffs the delimiter
    if (!LOCAL_TYPES.test(file.name)) {
      toast.error("Upload your statement as PDF, Excel (.xls, .xlsx), CSV or .txt");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => startMapping(parseStatement(ev.target.result), file.name);
    reader.readAsText(file);
  };

  const canProceed = debitCreditMode
    ? (mapping.date && (mapping.debit || mapping.credit))
    : (mapping.date && mapping.amount);

  const buildPreview = () => {
    const next = buildImportRows(csvData?.rows || [], mapping, { debitCreditMode, flipSign });
    if (next.rows.length === 0) {
      toast.error("No rows could be read with this mapping — check the date and amount columns.");
      return;
    }
    setBuilt(next);
    setStep(2);
  };

  const doImport = async () => {
    setImporting(true);
    try {
      const params = account.trim() ? { accountType, account: account.trim() } : { accountType };
      const res = await API.post("/transactions/batch", built.rows, { params });
      const imported = res.data?.imported ?? built.rows.length;
      const duplicates = res.data?.duplicates ?? 0;
      const reconciled = res.data?.reconciled ?? 0;
      const notInStatement = res.data?.notInStatement ?? 0;
      setResult({ imported, duplicates, reconciled, notInStatement, skipped: (res.data?.skipped ?? 0) + built.skipped });
      setCoverageKey(k => k + 1);
      reportMapping(imported);
      toast.success(duplicates
        ? `Imported ${imported} transactions · ${duplicates} already imported earlier`
        : `Imported ${imported} transactions!`);
      if (onImported) {
        const months = [...new Set(built.rows.map(r => r.date.slice(0, 7)))].sort();
        onImported({ imported, duplicates, reconciled, months, accountType, account: account.trim() });
      }
    } catch (err) {
      toast.error("Import failed: " + (err?.response?.data?.message || "Check your column mapping."));
    } finally {
      setImporting(false);
    }
  };

  // Header row + guessed vs used columns only; never transaction rows.
  // Best effort: a failure here must not look like a failed import.
  const reportMapping = (rows) => {
    if (!detected || !csvData?.headers?.length) return;
    const used = { ...mapping, debitCreditMode, flipSign };
    const clean = (m) => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== "" && v != null));
    API.post("/imports/mapping-feedback", {
      headers: csvData.headers,
      detected: clean(detected.mapping),
      final: clean(used),
      fileType: detected.fileType,
      detectedFormat: detected.format,
      rows,
    }).catch(() => {});
  };

  const reset = () => {
    setStep(0);
    setCsvData(null);
    setFileName("");
    setAccountType("BANK");
    setAccount("");
    setDebitCreditMode(false);
    setFlipSign(false);
    setMapping(EMPTY_MAPPING);
    setDetected(null);
    setBuilt({ rows: [], skipped: 0 });
    setResult(null);
    setLockedFile(null);
    setPassword("");
    setPasswordError("");
  };

  const headers = csvData?.headers || [];
  const CARD = { background: "var(--bg-card)", border: "1px solid var(--border-card)", borderRadius: "var(--radius-card)", padding: 20, marginBottom: 24 };

  return (
    <div style={{ maxWidth: 672 }}>
      {!compact && <>
      <SmsSyncCard onImported={() => setCoverageKey(k => k + 1)} />
      <IphoneSmsCard />
      <DataCoverage refreshKey={coverageKey} />
      </>}

      {!compact && (
        <div style={{ margin: "8px 4px 12px" }}>
          <h2 className="text-heading text-ink">Bank statement</h2>
          <p className="text-small text-ink-3">PDF, Excel or CSV from net banking</p>
        </div>
      )}
      <StepIndicator step={step} />

      {/* Step 0: Upload */}
      {step === 0 && (
        <div style={CARD}>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.55, marginBottom: 16 }}>
            Download a bank or credit card statement and choose it here. FinTwin finds the table and guesses the columns, which you can check next. Adding the same statement twice is safe: rows already in are skipped.
          </p>

          <label
            htmlFor="csv-upload"
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              border: "2px dashed var(--border-card-hover)", borderRadius: "var(--radius-card)", height: 160, cursor: "pointer",
              textAlign: "center", padding: "0 20px", gap: 6,
            }}
          >
            <span style={{ width: 48, height: 48, borderRadius: 99, background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FileText size={22} aria-hidden />
            </span>
            <span style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)" }}>
              {reading ? "Reading your statement…" : "Choose a statement"}
            </span>
            <span style={{ fontSize: 13, color: "var(--text-dim)" }}>SBI, HDFC, ICICI, Axis, Kotak and most others</span>
          </label>
          <input ref={fileRef} id="csv-upload" type="file" accept=".pdf,.xls,.xlsx,.csv,.txt" disabled={reading} style={{ display: "none" }} onChange={handleFile} />

          {lockedFile && (
            <form
              onSubmit={e => { e.preventDefault(); if (password) readOnServer(lockedFile, password); }}
              style={{ marginTop: 16, padding: 16, background: "var(--accent-soft)", border: "1px solid var(--accent)", borderRadius: 12 }}
            >
              <label htmlFor="statement-password" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                {lockedFile.name} is password-protected
              </label>
              <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "0 0 10px", lineHeight: 1.5 }}>
                Banks usually build it from your name, date of birth or customer ID — the email the statement came with says which. It's used once to open the file and never saved.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  id="statement-password"
                  type="password"
                  autoComplete="off"
                  autoFocus
                  value={password}
                  onChange={e => { setPassword(e.target.value); setPasswordError(""); }}
                  style={{ ...inp, flex: 1 }}
                />
                <button
                  type="submit"
                  disabled={!password || reading}
                  style={{ padding: "0 18px", height: 44, borderRadius: 999, border: "none", background: "var(--accent-strong)", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: password && !reading ? 1 : 0.4 }}
                >
                  {reading ? "Opening…" : "Open"}
                </button>
              </div>
              {passwordError && (
                <div role="alert" style={{ marginTop: 8, fontSize: 12, color: "var(--bad)" }}>{passwordError}</div>
              )}
            </form>
          )}

          <p style={{ marginTop: 12, fontSize: 13, color: "var(--text-dim)", textAlign: "center" }}>
            One receipt or screenshot? Use Receipts instead.
          </p>
        </div>
      )}

      {/* Step 1: Column mapping */}
      {step === 1 && csvData && (
        <div style={CARD}>
          <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>Check the columns</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 16 }}>
            File: <strong style={{ color: "var(--accent)" }}>{fileName}</strong> · {csvData.rows.length} rows found
            {csvData.preambleLines > 0 && <> · skipped {csvData.preambleLines} header lines</>}
          </div>

          {/* Account type — card statements invert the meaning of credits */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 8 }}>This statement is from</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { value: "BANK", label: "Bank account", hint: "Savings or current account" },
                { value: "CARD", label: "Credit card", hint: "Card payments you make are not counted twice" },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setAccountType(opt.value)}
                  style={{
                    flex: 1, padding: "10px 14px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                    fontSize: 12, fontWeight: 600, transition: "all 0.2s", textAlign: "left",
                    background: accountType === opt.value ? "var(--accent-soft)" : "var(--bg-input)",
                    border: `1px solid ${accountType === opt.value ? "var(--accent)" : "var(--border-card)"}`,
                    color: accountType === opt.value ? "var(--accent)" : "var(--text-dim)",
                  }}
                >
                  {opt.label}
                  <div style={{ fontSize: 10, fontWeight: 400, marginTop: 3, color: accountType === opt.value ? "var(--accent)" : "var(--text-dim)" }}>
                    {opt.hint}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label htmlFor="statement-account" style={lbl}>ACCOUNT</label>
            <input
              id="statement-account"
              value={account}
              maxLength={64}
              placeholder={accountType === "CARD" ? "e.g. HDFC ··5678" : "e.g. HDFC ··1234"}
              onChange={e => setAccount(e.target.value)}
              style={inp}
            />
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 5 }}>
              Keeps each account's months separate, and matches this statement to that account's alert emails.
            </div>
            {UPI_APPS.test(account) && (
              <div role="note" style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "var(--warn-soft)", border: "1px solid var(--warn-soft)", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                <strong style={{ color: "var(--warn)" }}>UPI app statement.</strong> Its payments also appear in the statement of the bank account they were paid from.
                Import either this or that bank's statement for the same months — not both — or UPI spending is counted twice.
              </div>
            )}
          </div>

          {/* Bank format toggle */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 8 }}>AMOUNT FORMAT</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setDebitCreditMode(false)}
                style={{
                  flex: 1, padding: "10px 14px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                  fontSize: 12, fontWeight: 600, transition: "all 0.2s", textAlign: "left",
                  background: !debitCreditMode ? "var(--accent-soft)" : "var(--bg-input)",
                  border: `1px solid ${!debitCreditMode ? "var(--accent)" : "var(--border-card)"}`,
                  color: !debitCreditMode ? "var(--accent)" : "var(--text-dim)",
                }}
              >
                Single Amount Column
                <div style={{ fontSize: 10, fontWeight: 400, marginTop: 3, color: !debitCreditMode ? "var(--accent)" : "var(--text-dim)" }}>
                  One amount column — signed, or with a Debit/Credit column (PhonePe)
                </div>
              </button>
              <button
                onClick={() => setDebitCreditMode(true)}
                style={{
                  flex: 1, padding: "10px 14px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                  fontSize: 12, fontWeight: 600, transition: "all 0.2s", textAlign: "left",
                  background: debitCreditMode ? "var(--good-soft)" : "var(--bg-input)",
                  border: `1px solid ${debitCreditMode ? "var(--good-soft)" : "var(--border-card)"}`,
                  color: debitCreditMode ? "var(--good)" : "var(--text-dim)",
                }}
              >
                Separate Debit + Credit
                <div style={{ fontSize: 10, fontWeight: 400, marginTop: 3, color: debitCreditMode ? "var(--good)" : "var(--text-dim)" }}>
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
                  <label style={lbl}>Debit Column <span style={{ color: "var(--bad)", fontWeight: 400 }}>(withdrawals / expenses)</span></label>
                  <select style={inp} value={mapping.debit} onChange={e => setMapping(m => ({ ...m, debit: e.target.value }))}>
                    <option value="">-- Which column has debits? --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Credit Column <span style={{ color: "var(--good)", fontWeight: 400 }}>(deposits / income)</span></label>
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

            {!debitCreditMode && (
              <div>
                <label style={lbl}>Debit / Credit Column</label>
                <select style={inp} value={mapping.direction} onChange={e => setMapping(m => ({ ...m, direction: e.target.value }))}>
                  <option value="">-- Only if amounts have no +/− sign --</option>
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

            {/* Balance — lets identical same-day rows be told apart on re-import */}
            <div>
              <label style={lbl}>Balance Column</label>
              <select style={inp} value={mapping.balance} onChange={e => setMapping(m => ({ ...m, balance: e.target.value }))}>
                <option value="">-- Running balance (optional) --</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>

          {/* Sample row preview */}
          {csvData.rows.length > 0 && (
            <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-card)", borderRadius: 10, padding: 14, marginBottom: 16, overflowX: "auto" }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 8 }}>SAMPLE ROW (FIRST ROW)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {headers.map(h => (
                  <div key={h} style={{ minWidth: 120 }}>
                    <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 2, fontWeight: 700 }}>{h}</div>
                    <div style={{ fontSize: 12, color: "var(--text-primary)", background: "var(--bg-input)", borderRadius: 6, padding: "4px 8px" }}>{csvData.rows[0][h] || "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!debitCreditMode && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontSize: 12, color: "var(--text-secondary)", cursor: "pointer" }}>
              <input type="checkbox" checked={flipSign} onChange={e => setFlipSign(e.target.checked)} />
              Spending shows as positive numbers in this file (common on card statements) — flip the signs
            </label>
          )}

          {debitCreditMode && (
            <div style={{ marginBottom: 16, padding: "10px 14px", background: "var(--good-soft)", border: "1px solid var(--good-soft)", borderRadius: 10, fontSize: 12, color: "var(--text-dim)" }}>
              Debit values → <strong style={{ color: "var(--bad)" }}>expense (−)</strong> &nbsp;·&nbsp; Credit values → <strong style={{ color: "var(--good)" }}>income (+)</strong>. Rows where both are empty or zero are skipped.
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setStep(0)} style={{ flex: 0, height: 44, padding: "0 18px", borderRadius: 999, border: "none", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Back</button>
            <button
              disabled={!canProceed}
              onClick={buildPreview}
              style={{ flex: 1, height: 44, borderRadius: 999, border: "none", background: "var(--accent-strong)", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: canProceed ? 1 : 0.4 }}
            >
              Preview {csvData.rows.length} rows
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Preview & import */}
      {step === 2 && (
        <div style={CARD}>
          <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>Look it over</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 16 }}>
            {(() => {
              const sum = summarize(built.rows);
              const inr = n => "₹" + Math.round(n).toLocaleString("en-IN");
              return <>
                {sum.count} transactions from {sum.from} to {sum.to} · {inr(sum.out)} out · {inr(sum.in)} in
                {built.skipped > 0 && <> · {built.skipped} rows without a date or amount skipped</>}
                <br />Showing the first {Math.min(10, sum.count)}. Categories marked Auto are filled in from the description.
              </>;
            })()}
          </div>

          <div style={{ overflowX: "auto", marginBottom: 20 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-card)" }}>
                  {["Date","Merchant","Amount","Category"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {built.rows.slice(0, 10).map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border-card)" }}>
                    <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--text-dim)" }}>{row.date}</td>
                    <td style={{ padding: "9px 12px", fontSize: 14, color: "var(--text-primary)" }}>{row.merchant}</td>
                    <td style={{ padding: "9px 12px", fontSize: 13, fontWeight: 700, color: row.amount >= 0 ? "var(--good)" : "var(--bad)" }}>
                      {row.amount >= 0 ? "+" : ""}₹{Math.abs(row.amount).toLocaleString("en-IN")}
                    </td>
                    <td style={{ padding: "9px 12px" }}>
                      <span style={{ fontSize: 11, color: "var(--accent)", background: "var(--accent-soft)", border: "1px solid var(--accent-soft)", borderRadius: 6, padding: "2px 8px" }}>
                        {row.category || "Auto"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ width: 48, height: 48, borderRadius: 99, background: "var(--good-soft)", color: "var(--good)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}><Check size={22} aria-hidden /></div>
              <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>Import complete</div>
              <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 20 }}>
                {result.imported} transactions imported
                {result.duplicates > 0 && <> · {result.duplicates} already imported earlier, skipped</>}
                {result.reconciled > 0 && <> · {result.reconciled} already added from alert emails or Spend Guard, now confirmed by the statement</>}
                {result.notInStatement > 0 && <> · {result.notInStatement} Spend Guard payment{result.notInStatement === 1 ? " wasn't" : "s weren't"} in this statement: check Transactions to say whether you paid</>}
                {result.skipped > 0 && <> · {result.skipped} rows could not be read</>}
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                {onViewTransactions && (
                  <button onClick={onViewTransactions} style={{ padding: "0 20px", height: 44, borderRadius: 999, border: "none", background: "var(--accent-strong)", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Check transactions</button>
                )}
                <button onClick={reset} style={{ height: 44, padding: "0 18px", borderRadius: 999, border: "none", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Import another file</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(1)} style={{ flex: 0, height: 44, padding: "0 18px", borderRadius: 999, border: "none", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Back</button>
              <button
                onClick={doImport}
                disabled={importing}
                style={{ flex: 1, height: 44, borderRadius: 999, border: "none", background: "var(--accent-strong)", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
              >
                {importing ? "Importing…" : `Import ${built.rows.length} transactions`}
              </button>
            </div>
          )}
        </div>
      )}

      {!compact && <EmailAlertsSetup />}
    </div>
  );
}

const lbl = { display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 };
const inp = { width: "100%", height: 44, padding: "0 12px", borderRadius: "var(--radius-control)", background: "var(--bg-input)", border: "1px solid transparent", color: "var(--text-primary)", fontSize: 15, outline: "none", fontFamily: "inherit", boxSizing: "border-box", appearance: "none" };
